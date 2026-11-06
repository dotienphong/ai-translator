import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIO_RATE, clickSample, duckGainAt, mixAudio, mouseSample, popSample, transitionSample } from "./audio.mjs";

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

test("tiếng chuyển cảnh transitionSample tất định, dài 280 ms, không vượt 0,25", () => {
  const a = transitionSample();
  assert.deepEqual(Array.from(a), Array.from(transitionSample()));
  assert.equal(a.length, Math.round(0.28 * AUDIO_RATE));
  assert.ok(a.every((v) => Math.abs(v) <= 0.25));
  assert.ok(a.some((v) => Math.abs(v) > 0.02));
});

test("duckGainAt hạ âm mượt theo rampMs và xử lý an toàn rampMs = 0", () => {
  const wins = [{ fromMs: 1000, toMs: 3000, gain: 0.2, rampMs: 200 }];
  assert.equal(duckGainAt(900, wins), 1);
  assert.equal(duckGainAt(1000, wins), 1);
  assert.ok(Math.abs(duckGainAt(1100, wins) - 0.6) < 1e-6);
  assert.ok(Math.abs(duckGainAt(1200, wins) - 0.2) < 1e-6);
  assert.ok(Math.abs(duckGainAt(2500, wins) - 0.2) < 1e-6);
  assert.ok(Math.abs(duckGainAt(2900, wins) - 0.6) < 1e-6);
  assert.equal(duckGainAt(3000, wins), 1);
  assert.equal(duckGainAt(1500, [{ fromMs: 1000, toMs: 2000, gain: 0.25, rampMs: 0 }]), 0.25);
});

test("mixAudio áp duckWindows lên segments gốc nhưng giữ nguyên âm lượng ttsSegments", () => {
  const seg = new Float32Array(480).fill(0.5);
  const tts = new Float32Array(480).fill(0.4);
  const out = mixAudio({
    segments: [{ samples: seg, startMs: 1000 }],
    duckWindows: [{ fromMs: 500, toMs: 1500, gain: 0.2, rampMs: 0 }],
    ttsSegments: [{ samples: tts, startMs: 1000 }],
    sounds: [{ at: 100, kind: "transition" }],
    totalMs: 2000,
  });
  // Tại 1000 ms (mẫu 48000): 0.5 * 0.2 + 0.4 = 0.5
  assert.ok(Math.abs(out[48_000] - 0.5) < 1e-5);
});

test("mixAudio hỗ trợ atMs và cắt mẫu theo srcStartMs, durationMs (như audioPlan của showcase-timeline)", () => {
  const full = new Float32Array(96_000);
  full.fill(0.3, 0, 48_000);
  full.fill(0.7, 48_000, 96_000);
  const tts = new Float32Array(4800).fill(0.5);
  const out = mixAudio({
    segments: [{ samples: full, atMs: 500, srcStartMs: 1000, durationMs: 500, gain: 1 }],
    ttsSegments: [{ samples: tts, atMs: 1200, gain: 1 }],
    totalMs: 2000,
  });
  // Nửa sau (0.7) được đặt tại 500 ms (mẫu 24000), dài 500 ms (tới 1000 ms, mẫu 48000)
  assert.ok(Math.abs(out[24_000] - 0.7) < 1e-5);
  assert.equal(out[48_100], 0);
  // TTS đặt tại 1200 ms (mẫu 57600)
  assert.ok(Math.abs(out[57_600] - 0.5) < 1e-5);
});
