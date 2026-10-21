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
