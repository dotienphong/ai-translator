// Sinh toàn bộ dữ liệu âm thanh thật (48 kHz mono PCM WAV) và JSON cho kịch bản `showcase.vi` trên Windows:
// 1. Tách giọng tiếng Anh của cuộc họp từ `website/src/assets/video/ai-translator-meeting.vi.mp4` → `target/demo-video/voice48.vi.wav`
//    (khớp hoàn toàn với `data/voice.vi.json` và `data/live.vi.json`).
// 2. Dùng giọng tiếng Anh bản xứ `Microsoft David Desktop` (System.Speech.Synthesis ở chuẩn 48 kHz 16-bit mono) kèm sự kiện
//    `SpeakProgress` lấy mốc mili-giây chính xác của từng từ tiếng Anh cho 3 câu hội thảo YouTube (`voice48.youtube.vi.wav`,
//    `data/voice.youtube.vi.json`, `data/youtube.vi.json`) — đảm bảo âm thanh phát ngay lập tức và chữ phụ đề luôn đi sau giọng nói thật.
// 3. Dùng `tts-worker-x86_64-pc-windows-msvc.exe` thật (VieNeu v3 Turbo ONNX INT8 + MossCodec) để tổng hợp các đoạn giọng đọc AI tiếng Việt:
//    `tts.meet-1.vi.wav`, `tts.meet-2.vi.wav`, `tts.preview.vi.wav`, `tts.yt-0.vi.wav`, `tts.yt-1.vi.wav`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesizeWithWorker } from "./tts-win.mjs";
import { LEVEL_WINDOW_MS, assembleVoice, rmsLevels, trimSilence, truthFor } from "./voice.mjs";
import { readWav, writeWav } from "./wav.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outDir = path.join(root, "target/demo-video");
const dataDir = path.join(here, "data");
mkdirSync(outDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });

const RATE = 48_000;
const YT_LEAD_MS = 20;
const YT_GAPS_MS = [1600, 900, 0];

// 1. Tách `voice48.vi.wav` từ video cuộc họp đã có (bắt đầu từ 0.8s, dài 17.303s đúng `data/voice.vi.json`)
const voiceMeta = JSON.parse(readFileSync(path.join(dataDir, "voice.vi.json"), "utf8"));
const meetingMp4 = path.join(root, "website/src/assets/video/ai-translator-meeting.vi.mp4");
const voice48Path = path.join(outDir, "voice48.vi.wav");
execFileSync("ffmpeg", [
  "-v", "error", "-y",
  "-ss", "0.8",
  "-t", (voiceMeta.durationMs / 1000).toFixed(3),
  "-i", meetingMp4,
  "-vn", "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le",
  voice48Path,
]);
console.log(`✔ Đã tách ${voice48Path} (${voiceMeta.durationMs} ms)`);

const ytEnSentences = [
  {
    id: 10,
    en: "Welcome back to our global product keynote.",
    vi: "Chào mừng quý vị quay trở lại buổi hội thảo sản phẩm toàn cầu của chúng tôi.",
  },
  {
    id: 11,
    en: "Today we are looking at how real-time translation changes remote collaboration.",
    vi: "Hôm nay chúng ta cùng xem công nghệ dịch thời gian thực thay đổi cách làm việc từ xa như thế nào.",
  },
  {
    id: 12,
    en: "With on-device AI, every language barrier disappears instantly.",
    vi: "Nhờ trí tuệ nhân tạo xử lý ngay trên thiết bị, mọi rào cản ngôn ngữ đều được xóa bỏ ngay lập tức.",
  },
];

// 2. Tổng hợp 3 câu tiếng Anh của hội thảo YouTube bằng `Microsoft David Desktop` (48 kHz mono) + lấy mốc từ `SpeakProgress`
const psScriptPath = path.join(outDir, "synth-yt-en.ps1");
const ytMetaPath = path.join(outDir, "yt-en-words.json");
const psLines = [
  "Add-Type -AssemblyName System.Speech",
  "$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)",
  "$sentences = @(",
  ...ytEnSentences.map((s) => `  ${JSON.stringify(s.en)}`),
  ")",
  "$allWords = @()",
  "for ($i = 0; $i -lt $sentences.Count; $i++) {",
  "  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
  "  $synth.SelectVoice('Microsoft David Desktop')",
  "  $synth.Rate = 1",
  "  $words = [System.Collections.Generic.List[object]]::new()",
  "  $synth.Add_SpeakProgress({ param($s, $e) $words.Add(@{ ms = [int]$e.AudioPosition.TotalMilliseconds; word = $e.Text }) })",
  `  $wavPath = Join-Path ${JSON.stringify(outDir)} ("yt-en-" + $i + ".wav")`,
  "  $synth.SetOutputToWaveFile($wavPath, $fmt)",
  "  $synth.Speak($sentences[$i])",
  "  $synth.Dispose()",
  "  $allWords += ,$words",
  "}",
  `$allWords | ConvertTo-Json -Depth 5 | Set-Content -Path ${JSON.stringify(ytMetaPath)} -Encoding UTF8`,
];
writeFileSync(psScriptPath, psLines.join("\r\n"), "utf8");
execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScriptPath], { stdio: "inherit" });

const rawWordTimings = JSON.parse(readFileSync(ytMetaPath, "utf8").replace(/^\uFEFF/, ""));

// Cắt khoảng lặng đầu/cuối của từng câu tiếng Anh và tính lại mốc từ chính xác sau khi cắt
const ytTrimmed = [];
const ytTrimOffsetsMs = [];
ytEnSentences.forEach((_, i) => {
  const wavBytes = readFileSync(path.join(outDir, `yt-en-${i}.wav`));
  const { samples, rate } = readWav(wavBytes);
  // Tìm mẫu đầu tiên > 0.01 để biết đã cắt bao nhiêu ms ở đầu
  const firstIdx = samples.findIndex((v) => Math.abs(v) > 0.01);
  const padSamples = Math.round((20 / 1000) * rate);
  const startSample = Math.max(0, firstIdx - padSamples);
  ytTrimOffsetsMs.push((startSample / rate) * 1000);
  ytTrimmed.push(trimSilence(samples, rate));
});

const ytJoined = assembleVoice(ytTrimmed, {
  rate: RATE,
  leadMs: YT_LEAD_MS,
  tailMs: 120,
  gapsMs: YT_GAPS_MS,
});
const ytWavBytes = writeWav(ytJoined.samples, RATE);
const ytWavPath = path.join(outDir, "voice48.youtube.vi.wav");
writeFileSync(ytWavPath, ytWavBytes);

const ytDurationMs = Math.round((ytJoined.samples.length / RATE) * 1000);
const ytLevels = rmsLevels(ytJoined.samples, RATE, LEVEL_WINDOW_MS);
const ytTruth = truthFor(
  ytEnSentences.map((s) => ({ text: s.en })),
  ytJoined.spans,
  "en",
);

const ytVoiceJson = {
  voice: "Microsoft David Desktop",
  rate: RATE,
  durationMs: ytDurationMs,
  leadMs: YT_LEAD_MS,
  sha256: createHash("sha256").update(ytWavBytes).digest("hex"),
  levelWindowMs: LEVEL_WINDOW_MS,
  levels: ytLevels,
  truth: ytTruth,
};
writeFileSync(path.join(dataDir, "voice.youtube.vi.json"), `${JSON.stringify(ytVoiceJson, null, 1)}\n`, "utf8");
console.log(`✔ Đã tạo data/voice.youtube.vi.json (${ytDurationMs} ms):`, ytTruth.map((t) => `${t.start_ms}..${t.end_ms}ms`));

// Dựng sự kiện phụ đề streaming + chốt bám sát mốc từng từ tiếng Anh thật (sau khi người nói phát âm từ đó 180 ms)
const ytEvents = [];
ytEnSentences.forEach((s, idx) => {
  const span = ytTruth[idx];
  const startMs = span.start_ms;
  const endMs = span.end_ms;
  const trimOffset = ytTrimOffsetsMs[idx];
  const wordList = Array.isArray(rawWordTimings[idx]) ? rawWordTimings[idx] : [rawWordTimings[idx]];
  const enWords = s.en.split(" ");
  const viWords = s.vi.split(" ");
  const steps = 4;

  for (let k = 1; k <= steps; k++) {
    const enCount = Math.max(1, Math.ceil((enWords.length * k) / steps));
    const viCount = Math.max(1, Math.ceil((viWords.length * (k - 0.25)) / steps));
    const wordIdx = Math.min(wordList.length - 1, enCount - 1);
    const wordRelMs = Math.max(0, (wordList[wordIdx]?.ms ?? 0) - trimOffset);
    // Phụ đề đang nói xuất hiện sau khi từ thứ `enCount` bắt đầu phát âm ~220 ms (cộng CAPTURE_DISPLAY_MS = 80 ms là 300 ms)
    const tMs = Math.min(endMs + 40, Math.round(startMs + wordRelMs + 220));
    const srcStableWords = enWords.slice(0, enCount - 1).join(" ");
    const tgtStableWords = viWords.slice(0, Math.max(0, viCount - 1)).join(" ");
    ytEvents.push({
      t_ms: tMs,
      kind: "live",
      id: s.id,
      extends: null,
      src_lang: "en",
      src_stable: srcStableWords ? `${srcStableWords} ` : "",
      src_tail: enWords[enCount - 1] ?? "",
      tgt_stable: tgtStableWords ? `${tgtStableWords} ` : "",
      tgt_tail: viWords[Math.max(0, viCount - 1)] ?? "",
      tgt_src_units: enCount,
      speaker: null,
    });
  }
  const doneMs = endMs + 60;
  ytEvents.push({
    t_ms: doneMs,
    kind: "subtitle",
    id: s.id,
    start_ms: startMs,
    end_ms: endMs,
    src_lang: "en",
    src_text: s.en,
    tgt_text: s.vi,
    status: "done",
    provisional: false,
    replaces: [],
    speaker: null,
  });
  ytEvents.push({
    t_ms: doneMs + 5,
    kind: "live_end",
    id: s.id,
  });
});

writeFileSync(path.join(dataDir, "youtube.vi.json"), `${JSON.stringify({ events: ytEvents }, null, 1)}\n`, "utf8");
console.log(`✔ Đã tạo data/youtube.vi.json (${ytEvents.length} sự kiện bám sát từng từ)`);

// 3. Tổng hợp 6 đoạn giọng đọc AI tiếng Việt bằng `tts-worker-x86_64-pc-windows-msvc.exe` (tốc độ tự nhiên 1.12x–1.16x)
const ttsRequests = [
  {
    key: "meet0",
    lang: "vi",
    voice: "Thục Đoan",
    text: "Chúng ta cần hoãn việc ra mắt sang tuần thứ hai của tháng 11.",
    speed: 1.15,
    pauseScale: 0.85,
  },
  {
    key: "meet1",
    lang: "vi",
    voice: "Thục Đoan",
    text: "Đội ngũ thiết kế của chúng tôi đã phát hiện một vài vấn đề trong luồng thanh toán.",
    speed: 1.14,
    pauseScale: 0.85,
  },
  {
    key: "meet2",
    lang: "vi",
    voice: "Thục Đoan",
    text: "Bạn có thể gửi cho chúng tôi báo giá mới cho phần công việc phát sinh trước thứ Sáu được không?",
    speed: 1.14,
    pauseScale: 0.85,
  },
  {
    key: "preview",
    lang: "vi",
    voice: "Ngọc Huyền",
    text: "Xin chào, đây là giọng đọc thử của phần mềm dịch trực tiếp.",
    speed: 1.12,
    pauseScale: 0.9,
  },
  {
    key: "yt0",
    lang: "vi",
    voice: "Thục Đoan",
    text: ytEnSentences[0].vi,
    speed: 1.16,
    pauseScale: 0.85,
  },
  {
    key: "yt1",
    lang: "vi",
    voice: "Thục Đoan",
    text: ytEnSentences[2].vi,
    speed: 1.15,
    pauseScale: 0.85,
  },
];

console.log("Đang tổng hợp giọng đọc tiếng Việt bằng tts-worker-x86_64-pc-windows-msvc.exe...");
const byKey = await synthesizeWithWorker(ttsRequests);

function trimTight(samples, rate) {
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) <= 0.012) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) <= 0.012) last--;
  const leadPad = Math.round((4 / 1000) * rate);
  const tailPad = Math.round((15 / 1000) * rate);
  return samples.subarray(Math.max(0, first - leadPad), Math.min(samples.length, last + 1 + tailPad));
}

function saveTtsWav(key, filename) {
  const raw = byKey.get(key);
  const trimmed = trimTight(raw, RATE);
  const wavBytes = writeWav(trimmed, RATE);
  const fullPath = path.join(outDir, filename);
  writeFileSync(fullPath, wavBytes);
  const durMs = Math.round((trimmed.length / RATE) * 1000);
  console.log(`✔ Đã tạo ${filename} (${durMs} ms)`);
  return durMs;
}

const meet0Ms = saveTtsWav("meet0", "tts.meet-0.vi.wav");
const meet1Ms = saveTtsWav("meet1", "tts.meet-1.vi.wav");
const meet2Ms = saveTtsWav("meet2", "tts.meet-2.vi.wav");
const previewMs = saveTtsWav("preview", "tts.preview.vi.wav");
const yt0Ms = saveTtsWav("yt0", "tts.yt-0.vi.wav");
const yt1Ms = saveTtsWav("yt1", "tts.yt-1.vi.wav");

const ttsShowcaseMeta = {
  meet0Ms,
  meet1Ms,
  meet2Ms,
  previewMs,
  yt0Ms,
  yt1Ms,
};
writeFileSync(path.join(dataDir, "tts.showcase.vi.json"), `${JSON.stringify(ttsShowcaseMeta, null, 1)}\n`, "utf8");
console.log(`✔ Đã tạo data/tts.showcase.vi.json:`, ttsShowcaseMeta);
