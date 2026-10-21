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
