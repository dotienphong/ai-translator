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
