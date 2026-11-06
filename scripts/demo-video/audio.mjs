// Ghép tiếng của video (spec 2026-10-21-demo-video §2.5, bản 16:10 §5, bản showcase 2026-11-06 §5.2): giọng đọc đặt ở `voiceStartMs`
// (hoặc nhiều đoạn trong `segments`), áp hệ số hạ âm `duckWindows`, cộng giọng đọc dịch `ttsSegments` và các tiếng tự sinh (gõ phím,
// bấm chuột, "pop" báo tin nhắn, "transition" báo chuyển cảnh) ở các mốc `sounds`, dài đúng `totalMs`. 48 kHz mono, giá trị trong [-1, 1].
// Mọi tiếng dùng bộ sinh số giả ngẫu nhiên cố định hay hàm sin, nên lần nào cũng như nhau.

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

/** Tiếng chuyển cảnh êm: quãng năm mềm (440 Hz + 660 Hz) dài 280 ms, vào mượt và ngân nhẹ, biên độ <= 0,25. */
export function transitionSample(rate = AUDIO_RATE) {
  const out = new Float32Array(Math.round(0.28 * rate));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    const attack = Math.min(1, t / 0.018);
    const decay = Math.exp(-t / 0.085);
    const wave = 0.6 * Math.sin(2 * Math.PI * 440 * t) + 0.4 * Math.sin(2 * Math.PI * 660 * Math.max(0, t - 0.03));
    out[i] = Math.max(-0.25, Math.min(0.25, wave * attack * decay * 0.22));
  }
  return out;
}

const SAMPLES = { key: clickSample, mouse: mouseSample, pop: popSample, transition: transitionSample };

/** Hệ số âm lượng tại thời điểm `ms` theo danh sách khoảng hạ âm `duckWindows` (`[{ fromMs, toMs, gain, rampMs }]`). */
export function duckGainAt(ms, duckWindows = []) {
  let gain = 1;
  for (const w of duckWindows) {
    if (ms <= w.fromMs || ms >= w.toMs) continue;
    const ramp = w.rampMs ?? w.fadeMs ?? 150;
    let g = w.gain;
    if (ramp > 0) {
      if (ms < w.fromMs + ramp) {
        const p = (ms - w.fromMs) / ramp;
        g = 1 - (1 - w.gain) * p;
      } else if (ms > w.toMs - ramp) {
        const p = (w.toMs - ms) / ramp;
        g = 1 - (1 - w.gain) * p;
      }
    }
    gain = Math.min(gain, g);
  }
  return Math.max(0, Math.min(1, gain));
}

function sliceSegment(samples, srcStartMs, durationMs, rate) {
  if (!samples) return null;
  if (srcStartMs === undefined && durationMs === undefined) return samples;
  const fromIdx = Math.max(0, Math.round(((srcStartMs ?? 0) / 1000) * rate));
  const toIdx =
    durationMs !== undefined
      ? Math.min(samples.length, fromIdx + Math.round((durationMs / 1000) * rate))
      : samples.length;
  return samples.subarray(fromIdx, Math.max(fromIdx, toIdx));
}

/** Trộn giọng gốc (có áp `duckWindows`), giọng đọc dịch (`ttsSegments`) và các tiếng (`sounds`) thành một track dài `totalMs`. */
export function mixAudio({
  voice,
  voiceStartMs = 0,
  segments = [],
  duckWindows = [],
  ttsSegments = [],
  sounds = [],
  totalMs,
  rate = AUDIO_RATE,
}) {
  const out = new Float32Array(Math.round((totalMs / 1000) * rate));
  const add = (src, startMs, scale = 1, applyDuck = false) => {
    if (!src) return;
    if (!Number.isFinite(startMs)) throw new Error(`mixAudio: mốc thời gian không hợp lệ (${startMs})`);
    const offset = Math.round((startMs / 1000) * rate);
    for (let i = 0; i < src.length; i++) {
      const j = offset + i;
      if (j >= 0 && j < out.length) {
        const duck = applyDuck && duckWindows.length > 0 ? duckGainAt((j / rate) * 1000, duckWindows) : 1;
        out[j] += src[i] * scale * duck;
      }
    }
  };
  if (voice) add(voice, voiceStartMs, 1, true);
  for (const seg of segments) {
    const sub = sliceSegment(seg.samples, seg.srcStartMs, seg.durationMs, rate);
    add(sub, seg.startMs ?? seg.atMs, seg.gain ?? 1, true);
  }
  for (const tts of ttsSegments) {
    add(tts.samples, tts.startMs ?? tts.atMs, tts.gain ?? 1, false);
  }
  const made = new Map();
  for (const { at, kind } of sounds) {
    const make = SAMPLES[kind];
    if (!make) throw new Error(`không có tiếng "${kind}"`);
    if (!made.has(kind)) made.set(kind, make(rate));
    add(made.get(kind), at, 1, false);
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}
