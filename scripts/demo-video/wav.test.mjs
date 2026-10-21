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
