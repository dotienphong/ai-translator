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
