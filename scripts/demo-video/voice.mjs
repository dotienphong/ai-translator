// Tạo giọng đọc tiếng Anh cho video (spec 2026-10-21-demo-video §2.2): `say` đọc từng câu của kịch bản (48 kHz), cắt khoảng lặng
// đầu cuối, ghép với khoảng nghỉ đã khai; từ cùng file đó hạ mẫu ra WAV 16 kHz cho latency-bench và ghi mốc câu (truth.json).
//   node scripts/demo-video/voice.mjs [vi]
// Ra target/demo-video/voice48.<ngôn ngữ>.wav, voice16.<…>.wav, truth.<…>.json, và scripts/demo-video/data/voice.<…>.json
// (commit): độ dài, mốc câu, mức âm lượng mỗi 100 ms (chấm "đang nghe", vòng sáng người nói), mã băm của file 48 kHz để
// render.mjs kiểm đúng file đã dùng lấy chữ.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decimate3, readWav, writeWav } from "./wav.mjs";

export const VOICE_RATE = 48_000;
export const LEVEL_WINDOW_MS = 100;

/** Bỏ khoảng lặng đầu và cuối (|mẫu| ≤ `threshold`), chừa `padMs` mỗi bên. */
export function trimSilence(samples, rate, threshold = 0.01, padMs = 20) {
  const first = samples.findIndex((v) => Math.abs(v) > threshold);
  if (first < 0) throw new Error("câu đọc ra toàn khoảng lặng");
  let last = samples.length - 1;
  while (Math.abs(samples[last]) <= threshold) last--;
  const pad = Math.round((padMs / 1000) * rate);
  return samples.subarray(Math.max(0, first - pad), Math.min(samples.length, last + 1 + pad));
}

/** Ghép các câu: `leadMs` lặng, câu 1, nghỉ `gapsMs[0]`, câu 2, …, `tailMs` lặng. Trả mẫu và mốc đầu/cuối (ms) của từng câu. */
export function assembleVoice(clips, { rate, leadMs, tailMs, gapsMs }) {
  const toSamples = (ms) => Math.round((ms / 1000) * rate);
  const gap = (i) => (i < clips.length - 1 ? toSamples(gapsMs[i]) : 0);
  const total = clips.reduce((n, c, i) => n + c.length + gap(i), toSamples(leadMs) + toSamples(tailMs));
  const samples = new Float32Array(total);
  const spans = [];
  let at = toSamples(leadMs);
  clips.forEach((c, i) => {
    samples.set(c, at);
    spans.push({ startMs: (at / rate) * 1000, endMs: ((at + c.length) / rate) * 1000 });
    at += c.length + gap(i);
  });
  return { samples, spans };
}

/** RMS của từng khung `windowMs`, làm tròn 4 chữ số. */
export function rmsLevels(samples, rate, windowMs = LEVEL_WINDOW_MS) {
  const n = Math.round((windowMs / 1000) * rate);
  const out = [];
  for (let i = 0; i < samples.length; i += n) {
    const end = Math.min(samples.length, i + n);
    let sum = 0;
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    out.push(Math.round(Math.sqrt(sum / (end - i)) * 10_000) / 10_000);
  }
  return out;
}

/** Mốc câu cho `latency-bench session --truth` (định dạng `bench/phase0/data/latency/*.truth.json`). */
export function truthFor(lines, spans) {
  return lines.map((line, i) => ({
    id: `demo-${i + 1}`,
    lang: "en",
    start_ms: Math.round(spans[i].startMs),
    end_ms: Math.round(spans[i].endMs),
    vad_end_ms: Math.round(spans[i].endMs),
    text: line.text,
  }));
}

function main(lang) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(here, "../../target/demo-video");
  const script = JSON.parse(readFileSync(path.join(here, `script.${lang}.json`), "utf8"));
  const { name, leadMs, tailMs, lines } = script.voice;
  const installed = execFileSync("say", ["-v", "?"], { encoding: "utf8" })
    .split("\n")
    .some((l) => l.startsWith(`${name} `));
  if (!installed) {
    console.error(
      `Chưa có giọng "${name}". Tải trong System Settings › Accessibility › Spoken Content › System Voice › Manage Voices…, rồi chạy lại.`,
    );
    process.exit(1);
  }
  mkdirSync(path.join(out, "voice"), { recursive: true });
  const clips = lines.map((line, i) => {
    const file = path.join(out, "voice", `${lang}-${i + 1}.wav`);
    execFileSync("say", ["-v", name, "--file-format=WAVE", `--data-format=LEI16@${VOICE_RATE}`, "-o", file, line.text]);
    const { rate, samples } = readWav(readFileSync(file));
    if (rate !== VOICE_RATE) throw new Error(`${file}: ${rate} Hz, cần ${VOICE_RATE} Hz`);
    return trimSilence(samples, rate);
  });
  const gapsMs = lines.map((l) => l.gapAfterMs);
  const { samples, spans } = assembleVoice(clips, { rate: VOICE_RATE, leadMs, tailMs, gapsMs });
  const wav48 = writeWav(samples, VOICE_RATE);
  writeFileSync(path.join(out, `voice48.${lang}.wav`), wav48);
  writeFileSync(path.join(out, `voice16.${lang}.wav`), writeWav(decimate3(samples), 16_000));
  const truth = truthFor(lines, spans);
  writeFileSync(path.join(out, `truth.${lang}.json`), `${JSON.stringify(truth, null, 1)}\n`);
  const voice = {
    voice: name,
    macos: execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim(),
    rate: VOICE_RATE,
    durationMs: Math.round((samples.length / VOICE_RATE) * 1000),
    leadMs,
    sha256: createHash("sha256").update(wav48).digest("hex"),
    levelWindowMs: LEVEL_WINDOW_MS,
    levels: rmsLevels(samples, VOICE_RATE),
    truth,
  };
  mkdirSync(path.join(here, "data"), { recursive: true });
  writeFileSync(path.join(here, "data", `voice.${lang}.json`), `${JSON.stringify(voice, null, 1)}\n`);
  console.log(`${lines.length} câu, ${(voice.durationMs / 1000).toFixed(1)} giây → ${path.join(out, `voice48.${lang}.wav`)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] ?? "vi");
