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

test("mốc câu ghi đúng ngôn ngữ nguồn của giọng đọc", () => {
  const truth = truthFor([{ text: "Xin chào." }], [{ startMs: 600, endMs: 1500 }], "vi");
  assert.equal(truth[0].lang, "vi");
});
