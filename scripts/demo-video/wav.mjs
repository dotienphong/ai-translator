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
