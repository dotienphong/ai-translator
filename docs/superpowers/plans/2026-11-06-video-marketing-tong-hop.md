# Video Marketing Tổng Hợp (Họp Teams & Giọng Đọc + YouTube + Gõ Dịch Messenger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng video marketing tổng hợp dài 1,5–2 phút (`1920×1200`, 30 fps, có tiếng) trình diễn liền mạch 3 tính năng (Dịch cuộc họp kiểu Teams kèm Nghe dịch & màn hình Giọng đọc, Dịch video kiểu YouTube, Gõ dịch khi nhắn tin kiểu Messenger) với chuyển cảnh mượt và thẻ giới thiệu ngắn trước mỗi cảnh.

**Architecture:** Mở rộng hệ thống dựng video `scripts/demo-video/` trên Windows 11 thành 3 màn hình desktop ảo trượt ngang liên tiếp, kèm lớp thẻ giới thiệu tính năng (Intro Card) trước mỗi lần chuyển cảnh. Kết nối trực tiếp với `tts-worker-x86_64-pc-windows-msvc.exe` và engine dịch trên Windows để sinh âm thanh giọng nói gốc, giọng đọc bản dịch AI tiếng Việt, hiệu ứng hạ nhỏ âm lượng cuộc họp (ducking), và nhúng trực tiếp các cửa sổ thật (`overlay.html`, `compose.html`, `index.html?screen=voice`) của ứng dụng.

**Tech Stack:** Node.js (`node:test`), Vite (`scripts/ui-preview`), Chrome Headless CDP (`website/tools/browser/cdp.mjs`), Rust sidecar (`tts-worker`, `asr-worker`, `llama-server`), `ffmpeg` / `ffprobe`.

**Spec:** `docs/superpowers/specs/2026-11-06-video-marketing-tong-hop-design.md`

## Global Constraints

- Thời lượng video thành phẩm nằm trong khoảng `90_000..120_000 ms` (1,5–2 phút), độ phân giải `1920×1200` (khung CSS `1536×960`, `dpr: 1.25`), `30 fps`, mã hóa H.264 `yuv420p` + AAC `48 kHz`.
- Không gắn logo hay chữ tên thương hiệu bên thứ ba (`Microsoft Teams`, `YouTube`, `Facebook`, `Messenger`, `Windows`, `Apple`) lên giao diện mô phỏng.
- Không nêu tên công nghệ lõi hay tên model (`Whisper`, `Hy-MT`, `VieNeu`, `llama.cpp`, `ONNX`, `Tauri`) trên chữ hiển thị trong video; không ghi con số tốc độ đo lường nếu không kèm điều kiện đo.
- Phụ đề, bản dịch và giọng đọc AI phải lấy từ đầu ra thật của model trên máy.
- Giữ tương thích ngược 100% với các kịch bản cũ (`vi`, `desktop.vi`, `desktop.en`, `desktop.ja`, `desktop.zh`, `desktop.ko`); mọi unit test cũ trong `scripts/demo-video/*.test.mjs` phải tiếp tục pass.

## Review Focus

- `duckGainAt(t, duckWindows)` khi `t` nằm ngoài hoặc ngay tại biên `fromMs`/`toMs` hoặc khi `rampMs = 0`: phải trả giá trị trong `[0, 1]` mà không chia cho 0 (`NaN`).
- Giao thức `tts-protocol` trong `tts-win.mjs`: chuỗi UTF-8 tiếng Việt có dấu (nhiều byte hơn số ký tự) phải ghi đúng độ dài byte UTF-8 trong postcard, không dùng `.length` của chuỗi UTF-16.
- `render.mjs` kiểm khoảng thời lượng: kịch bản không khai báo `timing.durationRangeMs` vẫn phải dùng mặc định `[30_000, 60_000]` để không làm hỏng các kịch bản cũ.
- Khi thanh phụ đề `overlay.html` chuyển sang `locked: false` ở Cảnh 1b để hiện nút **Nghe dịch**, ở Cảnh 2 (YouTube) thanh phụ đề phải được xóa sạch các dòng cũ của cuộc họp hoặc khóa gọn lại để không còn dòng chữ của cuộc họp Teams nằm lẫn trong cảnh YouTube.
- Mọi chuyển động trong `desktop-youtube.mjs` và thẻ giới thiệu (`introCards`) phải tính thuần từ tham số `t` (ms), không dùng CSS animation/transition tự chạy lệch với đồng hồ ảo `vclock.js`.

---

### Task 1: Chuẩn bị `ffmpeg` và module giao tiếp `tts-worker` trên Windows (`tts-win.mjs`)

**Files:**
- Create: `scripts/demo-video/tts-win.mjs`
- Create: `scripts/demo-video/tts-win.test.mjs`

**Interfaces:**
- Produces:
  - `encodeVarint(n: number): Uint8Array`
  - `encodeSpeakFrame({ id: number, lang: "vi" | "en", text: string, voice?: string | null, speed?: number | null, pauseScale?: number | null }): Buffer`
  - `encodeShutdownFrame(): Buffer`
  - `decodeResponseFrame(body: Buffer): { kind: "ready", protocol: number } | { kind: "audio", id: number, seq: number, pcm: Int16Array } | { kind: "done", id: number } | { kind: "failed", id: number, errorKind: number }`
  - `synthesizeWithWorker(items: { id: string, lang: "vi" | "en", text: string, voice?: string | null, speed?: number | null }[], opts?: { rootDir?: string }): Promise<Map<string, Float32Array>>`

- [ ] **Step 1: Write the failing test in `scripts/demo-video/tts-win.test.mjs`**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { decodeResponseFrame, encodeShutdownFrame, encodeSpeakFrame, encodeVarint } from "./tts-win.mjs";

test("encodeVarint mã hóa đúng số nguyên không âm theo chuẩn postcard", () => {
  assert.deepEqual([...encodeVarint(0)], [0]);
  assert.deepEqual([...encodeVarint(127)], [127]);
  assert.deepEqual([...encodeVarint(128)], [0x80, 0x01]);
  assert.deepEqual([...encodeVarint(9600)], [0x80, 0x4b]);
});

test("encodeSpeakFrame ghi độ dài u32 LE và đúng byte UTF-8 cho chữ tiếng Việt", () => {
  const frame = encodeSpeakFrame({ id: 7, lang: "vi", text: "Xin chào", voice: "Thục Đoan", speed: null, pauseScale: null });
  const len = frame.readUInt32LE(0);
  assert.equal(frame.length, 4 + len);
  const body = frame.subarray(4);
  assert.equal(body[0], 0); // Request::Speak variant = 0
  assert.equal(body[1], 7); // id = 7
  assert.equal(body[2], 0); // Lang::Vi = 0
  const textBytes = Buffer.from("Xin chào", "utf8");
  assert.equal(body[3], textBytes.length);
  assert.deepEqual(body.subarray(4, 4 + textBytes.length), textBytes);
});

test("encodeShutdownFrame và decodeResponseFrame giải mã đúng Ready, Audio zigzag i16, Done", () => {
  const shut = encodeShutdownFrame();
  assert.deepEqual([...shut], [1, 0, 0, 0, 2]);
  // Response::Ready { protocol: 3 } -> [0, 3]
  assert.deepEqual(decodeResponseFrame(Buffer.from([0, 3])), { kind: "ready", protocol: 3 });
  // Response::Audio { id: 1, seq: 0, pcm: [0, 1, -1, 2] } -> zigzag varint: 0->0, 1->2, -1->1, 2->4
  const audio = decodeResponseFrame(Buffer.from([1, 1, 0, 4, 0, 2, 1, 4]));
  assert.equal(audio.kind, "audio");
  assert.deepEqual([...audio.pcm], [0, 1, -1, 2]);
  assert.deepEqual(decodeResponseFrame(Buffer.from([2, 5])), { kind: "done", id: 5 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/demo-video/tts-win.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./tts-win.mjs`.

- [ ] **Step 3: Implement `scripts/demo-video/tts-win.mjs`**

Implement `encodeVarint`, `encodeSpeakFrame`, `encodeShutdownFrame`, `decodeResponseFrame`, and `synthesizeWithWorker` speaking postcard frames over stdin/stdout to `src-tauri/binaries/tts-worker-x86_64-pc-windows-msvc.exe` with `--model-dir models/tts/vieneu-v3-turbo/onnx_int8 --codec-dir models/tts/moss-codec --g2p-dict models/tts/sea_g2p.bin --voices models/tts/voices_v3_turbo.json --ort-lib models/tts/onnxruntime.dll`. Convert `Int16Array` PCM chunks to `Float32Array` in `[-1, 1]` (`/ 32768`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/demo-video/tts-win.test.mjs`
Expected: PASS (3 tests passing).

---

### Task 2: Mở rộng `audio.mjs` hỗ trợ nhiều đoạn giọng, hạ âm lượng (ducking) và tiếng chuyển cảnh

**Files:**
- Modify: `scripts/demo-video/audio.mjs`
- Modify: `scripts/demo-video/audio.test.mjs`

**Interfaces:**
- Produces:
  - `transitionSample(rate?: number): Float32Array`
  - `duckGainAt(ms: number, duckWindows?: { fromMs: number, toMs: number, gain: number, rampMs?: number }[]): number`
  - `mixAudio({ voice?: Float32Array, voiceStartMs?: number, segments?: { samples: Float32Array, startMs: number, gain?: number }[], duckWindows?: { fromMs: number, toMs: number, gain: number, rampMs?: number }[], ttsSegments?: { samples: Float32Array, startMs: number, gain?: number }[], sounds: { at: number, kind: string }[], totalMs: number, rate?: number }): Float32Array`

- [ ] **Step 1: Write the failing tests in `scripts/demo-video/audio.test.mjs`**

Add tests to `scripts/demo-video/audio.test.mjs` asserting:
1. `transitionSample()` is deterministic, length `Math.round(0.28 * AUDIO_RATE)`, max amplitude `<= 0.25`, and `mixAudio` accepts `{ at: 100, kind: "transition" }`.
2. `duckGainAt(ms, [{ fromMs: 1000, toMs: 3000, gain: 0.2, rampMs: 200 }])` returns `1` for `ms <= 1000`, `0.6` at `ms = 1100`, `0.2` for `1200 <= ms <= 2800`, `0.6` at `ms = 2900`, `1` for `ms >= 3000`, and handles `rampMs = 0` without `NaN`.
3. `mixAudio` applies `duckWindows` to `voice` and `segments`, and mixes `ttsSegments` at full scale (without ducking `ttsSegments`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/demo-video/audio.test.mjs`
Expected: FAIL because `transitionSample` and `duckGainAt` are not exported and `duckWindows`/`ttsSegments` are not handled.

- [ ] **Step 3: Implement `transitionSample`, `duckGainAt`, and extended `mixAudio` in `scripts/demo-video/audio.mjs`**

Implement `transitionSample` (two-tone soft fifth chord chime 440 Hz + 660 Hz over 280 ms with smooth attack/decay, max `<= 0.25`), `duckGainAt`, and update `mixAudio` so `voice` (if provided) and `segments` (if provided) are scaled by `duckGainAt(sampleTimeMs, duckWindows)` before adding `ttsSegments` and `sounds`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/demo-video/audio.test.mjs`
Expected: PASS.

---

### Task 3: Bổ sung mock IPC cho `ListenControls` và `VoiceScreen` trong `scripts/ui-preview/tauri-mock.ts`

**Files:**
- Modify: `scripts/ui-preview/tauri-mock.ts`

**Interfaces:**
- Produces:
  - Mock handlers in `tauri-mock.ts` for `overlay_listen_status`, `overlay_listen_set`, `overlay_tts_status`, `tts_status`, `overlay_tts_warmup`, `overlay_tts_speak`, `tts_speak`, `tts_preview`, `overlay_tts_stop`, `tts_stop`.
  - Support in `demoHooks()` for `ttsSpeak?: (args: unknown) => number | undefined` (duration in ms before sending `{ kind: "done" }` on `onEvent.onmessage`).

- [ ] **Step 1: Add TTS and Listen handlers to `scripts/ui-preview/tauri-mock.ts`**

Update `scripts/ui-preview/tauri-mock.ts` so:
- `overlay_listen_status` returns `{ supported: platform === "windows", active: listenActive }`.
- `overlay_listen_set` sets `listenActive = args.enabled` and returns `{ supported: platform === "windows", active: listenActive }`.
- `overlay_tts_status` and `tts_status` return `{ available: platform === "windows" && param("tts") !== "0", running: false, reason: null, progress: null }`.
- `overlay_tts_speak`, `tts_speak`, and `tts_preview` send an empty `ArrayBuffer(960)` chunk on `args.onEvent.onmessage` after 20 ms (so `loading` becomes `false` and `speaking`/`previewing` stays active) and then send `{ kind: "done" }` after `demoHooks().ttsSpeak?.(args) ?? 1800` ms.

- [ ] **Step 2: Run typecheck and existing tests to verify no regressions**

Run: `pnpm test` (or `node_modules/.bin/tsc --noEmit`)
Expected: PASS with 0 errors.

---

### Task 4: Lịch thời gian tổng hợp `showcase-timeline.mjs` và kịch bản `script.showcase.vi.json`

**Files:**
- Create: `scripts/demo-video/showcase-timeline.mjs`
- Create: `scripts/demo-video/showcase-timeline.test.mjs`
- Create: `scripts/demo-video/script.showcase.vi.json`

**Interfaces:**
- Consumes: `FRAME_MS`, `COMPOSE_DEBOUNCE_MS`, `subtitleEvents`, `levelEvents`, `revealDeltas`, `typingSchedule`, `visibility` from `./timeline.mjs`; `SLIDE_MS`, `ease`, `cursorAt` from `./desktop-timeline.mjs`.
- Produces:
  - `buildShowcaseTimeline(script, data)` in `scripts/demo-video/showcase-timeline.mjs` returning `{ totalMs, frames, durationRangeMs, posterMs, scenes, introCards, labels, overlayEvents, listen, voiceWindow, youtube, chat, keys, cursorPath, compose, sounds, audioPlan, keyTimes }`.

- [ ] **Step 1: Write the failing test in `scripts/demo-video/showcase-timeline.test.mjs`**

Write tests verifying that `buildShowcaseTimeline`:
1. Produces `totalMs` within `[90_000, 120_000]` (90–120 seconds).
2. Orders all scenes strictly without invalid overlap: `intro1` → `meeting` (with `listenToggleAt` and `voiceWindow` `[openAt, closeAt]`) → `slide1` / `intro2` → `youtube` → `slide2` / `intro3` → `chat` → `outro`.
3. Emits `overlay://clear` before `youtube` starts so meeting subtitles do not leak into the YouTube scene, and emits `overlay://view` with `locked: false` before `listenToggleAt` so `ListenControls` is visible.
4. Builds `audioPlan` with `segments` (meeting voice + YouTube voice), `duckWindows` covering the active "Nghe dịch" speech spans, and `ttsSegments` placed after each finalized subtitle in the "Nghe dịch" segments + the `VoiceScreen` preview click.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/demo-video/showcase-timeline.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `scripts/demo-video/showcase-timeline.mjs` and `scripts/demo-video/script.showcase.vi.json`**

Implement `buildShowcaseTimeline` and `script.showcase.vi.json` with 3 intro cards, meeting scene (4 sentences: first 2 subtitle-only, next 2 with "Nghe dịch" enabled + ducking + Vietnamese AI voice + `VoiceScreen` window preview), YouTube browser scene (3 sentences of English tech keynote + live Vietnamese subtitles + AI voice on final sentence), and Messenger chat scene (`Ctrl + Alt + G` Gõ dịch).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/demo-video/showcase-timeline.test.mjs`
Expected: PASS.

---

### Task 5: Giao diện Cảnh 2 (`desktop-youtube.mjs`), Thẻ giới thiệu (`desktop-shell.mjs`), Cửa sổ Giọng đọc (`desktop.mjs`, `desktop.css`) và `render.mjs`

**Files:**
- Create: `scripts/demo-video/desktop-youtube.mjs`
- Modify: `scripts/demo-video/desktop-shell.mjs`
- Modify: `scripts/demo-video/desktop.mjs`
- Modify: `scripts/demo-video/desktop.css`
- Modify: `scripts/demo-video/render.mjs`
- Modify: `src/windows/overlay/overlay.tsx` (or `src/store/overlay.ts` if needed to support clearing lines in demo mode, or handle via `overlayFrame` in `desktop.mjs`)

**Interfaces:**
- Consumes: `buildShowcaseTimeline` from `./showcase-timeline.mjs`, `mixAudio` from `./audio.mjs`.
- Produces:
  - `buildYoutube(parent, ctx)` in `scripts/demo-video/desktop-youtube.mjs` with `render(t)`.
  - Updated `buildShell(parent, ctx)` rendering `tl.introCards` (full-screen blurred feature intro cards with step badge, title, and purpose subtitle) and 3-app taskbar state (`cam`, `globe`, `chat`).
  - Updated `desktop.mjs` supporting `script.stage === "showcase"` (3 desktops: `desk1` meeting + `mainFrame` VoiceScreen window, `desk2` YouTube browser, `desk3` Messenger chat; shared `overlayFrame` and `composeFrame`).
  - Updated `render.mjs` supporting `script.stage === "showcase"`, custom `tl.durationRangeMs ?? [30_000, 60_000]`, and `tl.audioPlan`.

- [ ] **Step 1: Implement `desktop-youtube.mjs`, update `desktop-shell.mjs`, `desktop.mjs`, `desktop.css`, and `render.mjs`**

1. In `desktop-youtube.mjs`: build a realistic browser window playing a 16:9 tech keynote video (speaker portrait with subtle motion + animated presentation slide deck + audio waveform bars, red progress bar advancing with `t`, time counter, video title, channel info, action pills, and 3 "Up next" video cards on the right).
2. In `desktop-shell.mjs` & `desktop.css`: render `tl.introCards` (`[{ step, title, desc, from, to }]`) as a sleek glassmorphic overlay card with smooth fade/scale computed from `t`.
3. In `desktop.mjs`: support `script.stage === "showcase"`, placing `desk1`, `desk2`, `desk3` side-by-side (`3 * viewport.width`), embedding `mainFrame` (`/index.html?demo=1&platform=windows&lang=vi&screen=voice&tts=1`) inside a draggable-styled app window frame on `desk1` during `tl.voiceWindow`, clicking `.listen-toggle` on `overlayFrame` at `tl.listen.toggleAt`, and resetting overlay lines between scenes.
4. In `render.mjs`: support `script.stage === "showcase"` and `tl.audioPlan`.

- [ ] **Step 2: Run all unit tests in `scripts/demo-video/`**

Run: `node --test scripts/demo-video/*.test.mjs`
Expected: PASS (all existing and new tests pass).

---

### Task 6: Sinh dữ liệu giọng đọc & phụ đề thật trên Windows, quay video MP4 và kiểm tra nghiệm thu

**Files:**
- Create: `scripts/demo-video/gen-showcase-data.mjs`
- Create: `scripts/demo-video/data/youtube.vi.json`
- Create: `scripts/demo-video/data/tts.showcase.vi.json`

- [ ] **Step 1: Chuẩn bị `ffmpeg`, ảnh đại diện `target/demo-video/frames/` và sinh dữ liệu thật bằng `gen-showcase-data.mjs`**

1. Đảm bảo `ffmpeg` và `ffprobe` có trong `PATH` (cài qua `winget` hoặc binary tĩnh nếu chưa có).
2. Chạy `assets.mjs` (hoặc trích xuất ảnh đại diện vào `target/demo-video/frames/`).
3. Chạy `node scripts/demo-video/gen-showcase-data.mjs`:
   - Dùng `tts-worker-x86_64-pc-windows-msvc.exe` tổng hợp:
     - Giọng đọc AI tiếng Việt (`Lang::Vi`, giọng `Thục Đoan`) cho các câu dịch của Cảnh 1b (Nghe dịch), câu mẫu Nghe thử ở màn hình Giọng đọc, và câu chốt của Cảnh 2 (YouTube).
     - Giọng tiếng Anh (`Lang::En`, giọng `Adam`) cho 3 câu thuyết trình của Cảnh 2 (YouTube).
   - Chạy `asr-worker` + `llama-server` (qua `latency-bench`) để lấy chuỗi sự kiện phụ đề streaming thật cho Cảnh 2 (`scripts/demo-video/data/youtube.vi.json`).
   - Ghép và lưu `target/demo-video/audio.showcase.vi.wav` + `scripts/demo-video/data/tts.showcase.vi.json`.

- [ ] **Step 2: Quay thử khung hình đại diện và quay toàn bộ video `showcase.vi`**

1. Khởi động Vite preview server ở cổng `1432`.
2. Chạy `node scripts/demo-video/render.mjs --script showcase.vi` để xuất `target/demo-video/ai-translator-demo.showcase.vi.mp4` và bộ ảnh `target/demo-video/keyframes.showcase.vi/`.
3. Kiểm tra bằng `ffprobe` (H.264 `1920×1200`, 30 fps, AAC 48 kHz, thời lượng 90–120 giây) và xem bằng mắt tất cả các ảnh trong `target/demo-video/keyframes.showcase.vi/` để đảm bảo giao diện đẹp, chữ rõ, không lỗi.
