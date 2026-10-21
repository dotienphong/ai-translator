// Quay video giới thiệu (spec 2026-10-21-demo-video §2.5, §5): mở stage.html trong Chrome không đầu với đồng hồ ảo (vclock.js),
// chụp từng khung 1080×1920 (540×960 điểm CSS, mật độ 2), ghép tiếng (audio.mjs) rồi gọi ffmpeg ra MP4. Kiểm luôn:
// - mỗi phụ đề chốt đã có trên thanh phụ đề ở đúng khung của nó;
// - ô soạn xin dịch đúng một lần, đúng lúc lịch tính;
// - trang không có lỗi JS;
// - video dài 30–60 giây.
// Kết quả kiểm ghi ở target/demo-video/checks.<ngôn ngữ>.json. Cần trang xem trước ở cổng 1432 và ffmpeg (`brew install ffmpeg`):
//   node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1432 &
//   node scripts/demo-video/render.mjs [--script vi]                              # → target/demo-video/ai-translator-demo.vi.mp4
//   node scripts/demo-video/render.mjs --png-dir <thư mục> --from 120 --to 240    # chỉ ghi PNG các khung [from, to), không ffmpeg
//     thêm --guides để tô đỏ phần ngoài vùng an toàn (chỉ khi ghi PNG)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { launch } from "../../website/tools/browser/cdp.mjs";
import { AUDIO_RATE, mixAudio } from "./audio.mjs";
import { FPS, FRAME_MS, buildTimeline } from "./timeline.mjs";
import { readWav, writeWav } from "./wav.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../target/demo-video");
const BASE = process.env.PREVIEW_URL ?? "http://127.0.0.1:1432";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { values: opts } = parseArgs({
  options: {
    script: { type: "string", default: "vi" },
    "png-dir": { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    guides: { type: "boolean", default: false },
  },
});
const lang = opts.script;
const json = (file) => JSON.parse(readFileSync(path.join(here, file), "utf8"));
const script = json(`script.${lang}.json`);
const voice = json(`data/voice.${lang}.json`);
const tl = buildTimeline(script, voice, json(`data/live.${lang}.json`), json(`data/compose.${lang}.json`));
if (tl.totalMs < 30_000 || tl.totalMs > 60_000) {
  console.error(`Video dài ${(tl.totalMs / 1000).toFixed(1)} giây, ngoài khoảng 30–60 giây: sửa kịch bản.`);
  process.exit(1);
}
const pngDir = opts["png-dir"];
const full = pngDir === undefined;
if (full && opts.guides) {
  console.error("--guides chỉ dùng với --png-dir: dải đỏ không được vào video.");
  process.exit(1);
}
const from = Number(opts.from ?? 0);
const to = Math.min(tl.frames, Number(opts.to ?? tl.frames));
mkdirSync(out, { recursive: true });
if (!full) mkdirSync(pngDir, { recursive: true });

// Khung chính để xem lại (spec §5.5): tên → thời điểm.
const c = tl.chat;
const KEYS = {
  "01-mo-dau": 1500,
  "02-dang-noi": tl.voiceStartMs + 4000,
  "03-phu-de": tl.posterMs,
  "04-tin-nhan": c.sarahAt + 600,
  "05-phim-tat": c.pressAt + 60,
  "06-dang-go": c.typing[Math.floor(c.typing.length / 2)].at + 10,
  "07-ban-dich": c.translatedAt + 300,
  "08-da-dan": c.pasteAt + 400,
  "09-da-gui": c.enter2At + 700,
  "10-ket": tl.totalMs - 1500,
};
const keyFrames = new Map(Object.entries(KEYS).map(([name, ms]) => [Math.round(ms / FRAME_MS), name]));
const posterFrame = Math.round(tl.posterMs / FRAME_MS);

let ffmpeg = null;
let ffmpegDone = null;
if (full) {
  const voiceFile = path.join(out, `voice48.${lang}.wav`);
  const bytes = readFileSync(voiceFile);
  if (createHash("sha256").update(bytes).digest("hex") !== voice.sha256) {
    console.error(`${voiceFile} khác file đã dùng để lấy chữ (data/voice.${lang}.json): chạy lại voice.mjs rồi data.mjs.`);
    process.exit(1);
  }
  const audioFile = path.join(out, `audio.${lang}.wav`);
  const mixed = mixAudio({ voice: readWav(bytes).samples, voiceStartMs: tl.voiceStartMs, clicks: tl.clicks, totalMs: tl.totalMs });
  writeFileSync(audioFile, writeWav(mixed, AUDIO_RATE));
  mkdirSync(path.join(out, `keyframes.${lang}`), { recursive: true });
  const mp4 = path.join(out, `ai-translator-demo.${lang}.mp4`);
  ffmpeg = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      "-i", audioFile,
      "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", "-shortest", mp4,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  ffmpegDone = new Promise((resolve, reject) => {
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg thoát với mã ${code}`))));
  });
  console.log(`→ ${mp4}`);
}

const failures = [];
const timing = [];
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome");
try {
  const page = await browser.newPage({ width: 540, height: 960, dpr: 2 });
  await page.s.send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(path.join(here, "vclock.js"), "utf8") });
  await page.goto(`${BASE}/scripts/demo-video/stage.html?script=${lang}${opts.guides ? "&guides=1" : ""}`);
  for (let i = 0; !(await page.eval("window.__stage?.ready === true")); i++) {
    if (i > 200) throw new Error(`trang dựng cảnh chưa sẵn sàng sau 20 giây: ${page.errors.join(" | ")}`);
    await sleep(100);
  }
  const finals = tl.overlayEvents.filter((e) => e.event === "subtitle://upsert" && e.payload.status === "done" && !e.payload.provisional);
  for (let i = 0; i < to; i++) {
    const t = i * FRAME_MS;
    // Tiến đồng hồ tới khung này, vẽ, rồi chờ hai khung thật của Chrome để trang (và iframe) vẽ xong.
    await page.eval(
      `(async () => { await __vclock.advanceTo(${t}); __stage.render(${t}); await new Promise((r) => __vclock.realFrame(() => __vclock.realFrame(r))); })()`,
    );
    for (const e of finals.filter((f) => f.at > t - FRAME_MS && f.at <= t)) {
      const shown = await page.eval(
        `document.querySelector(".overlay-frame").contentDocument.querySelector(".overlay .lines").textContent.includes(${JSON.stringify(e.payload.tgt_text)})`,
      );
      timing.push({ id: e.payload.id, scheduledMs: e.at, frameMs: t, shown });
      if (!shown) failures.push(`phụ đề ${e.payload.id} chưa có trên thanh phụ đề ở khung ${i} (${t.toFixed(1)} ms)`);
    }
    if (i < from) continue;
    const shot = Buffer.from((await page.s.send("Page.captureScreenshot", { format: "png" })).data, "base64");
    if (full) {
      if (!ffmpeg.stdin.write(shot)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
      if (i === posterFrame) writeFileSync(path.join(out, `poster.${lang}.png`), shot);
      if (keyFrames.has(i)) writeFileSync(path.join(out, `keyframes.${lang}`, `${keyFrames.get(i)}.png`), shot);
    } else {
      writeFileSync(path.join(pngDir, `${String(i).padStart(5, "0")}.png`), shot);
    }
    if (i % 150 === 0) console.log(`  khung ${i}/${to}`);
  }
  if (to * FRAME_MS > c.translatedAt) {
    const asked = await page.eval("__stage.log.translateAt");
    if (asked.length !== 1 || Math.abs(asked[0] - c.translateAt) > 1) {
      failures.push(`ô soạn xin dịch ${asked.length} lần (ở ${asked.join(", ")} ms), lịch tính một lần ở ${c.translateAt} ms`);
    }
  }
  failures.push(...page.errors.filter((e) => !e.includes("status of 404")).map((e) => `lỗi trong trang: ${e}`));
} finally {
  await browser.close();
}
if (full) {
  ffmpeg.stdin.end();
  await ffmpegDone;
}
writeFileSync(
  path.join(out, `checks.${lang}.json`),
  `${JSON.stringify({ totalMs: tl.totalMs, frames: tl.frames, range: [from, to], timing, failures }, null, 1)}\n`,
);
if (failures.length > 0) {
  console.error(`Không đạt:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Xong: khung ${from}–${to - 1} / ${tl.frames}, video ${(tl.totalMs / 1000).toFixed(1)} giây; đã kiểm ${timing.length} phụ đề chốt.`);
