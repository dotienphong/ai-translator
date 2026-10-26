// Tách video demo 16:10 thành hai video: dịch cuộc họp và Gõ dịch (spec 2026-10-26-tach-video-demo-hai-phan §3, §4). Cắt từ MP4
// đã duyệt (render.mjs ghi), không quay lại: mốc cắt tính từ chính lịch của video (desktop-timeline.mjs), nên không lệch nếu đổi kịch bản.
// - meeting: cảnh họp + màn kết, nối bằng chuyển mờ (hình và tiếng);
// - typing: cảnh nhắn tin tới hết màn kết, mờ dần vào (hình và tiếng) vì không còn cảnh trượt ngang dẫn vào.
// Cần ffmpeg, ffprobe (và cwebp khi --publish):
//   node scripts/demo-video/split.mjs [--lang vi,en,ja,zh,ko] [--publish]
//     → target/demo-video/ai-translator-<meeting|typing>.<lang>.mp4
//     --publish: thêm chép MP4 và làm ảnh bìa WebP vào website/src/assets/video/
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { buildDesktopTimeline } from "./desktop-timeline.mjs";
import { dataName, voiceName } from "./names.mjs";
import { CROSSFADE_MS, FPS } from "./timeline.mjs";

export const KINDS = ["meeting", "typing"];
/** Đoạn chồng của chuyển mờ họp → màn kết (khung); trùng độ dài mờ của màn kết trong video gốc. */
export const FADE_FRAMES = Math.round((CROSSFADE_MS * FPS) / 1000);
/** Mờ dần vào đầu video Gõ dịch (giây). */
const FADE_IN_S = 0.3;
// Khung chính làm ảnh bìa (spec §4): khung có phụ đề, khung bản dịch trong ô soạn.
const POSTER_FRAME = { meeting: "03-phu-de", typing: "09-ban-dich" };

/** Khung đầu tiên có thời điểm t >= ms (sai số 1e-9 để mốc đúng bằng một khung không bị làm tròn lên nhầm). */
const frameAt = (ms) => Math.ceil((ms * FPS) / 1000 - 1e-9);

/**
 * Kế hoạch cắt từ lịch của video (`scenes`, `frames` của buildDesktopTimeline): đoạn nào là khung nào, nửa mở [từ, tới).
 * Cảnh họp tới hết khung chưa trượt; cảnh chat từ khung đầu sau khi trượt xong; màn kết mờ dần vào quanh chatEnd trong
 * CROSSFADE_MS nên chỉ lấy từ lúc nó hiện hẳn (chatEnd + CROSSFADE_MS / 2), không thì lọt hình cửa sổ chat vào video họp.
 */
export function splitPlan(tl) {
  const { meeting, chat } = tl.scenes;
  return {
    total: tl.frames,
    meeting: [0, frameAt(meeting[1])],
    chat: [frameAt(chat[0]), tl.frames],
    outro: [frameAt(chat[1] + CROSSFADE_MS / 2), tl.frames],
  };
}

/** Số khung của video `kind` sau khi cắt. */
export function clipFrames(plan, kind) {
  if (kind === "meeting") return plan.meeting[1] + (plan.outro[1] - plan.outro[0]) - FADE_FRAMES;
  if (kind === "typing") return plan.chat[1] - plan.chat[0];
  throw new Error(`kind phải là meeting hoặc typing, nhận ${kind}`);
}

const sec = (frames) => Number((frames / FPS).toFixed(4));
// Cùng cách chuyển màu và mã hóa như render.mjs.
const TAIL = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";

/** Tham số ffmpeg cắt `input` thành video `kind`, ghi ra `output` (dạng MP4 dù tên có đuôi .part). */
export function ffmpegArgs(kind, plan, input, output) {
  clipFrames(plan, kind);
  let graph;
  if (kind === "meeting") {
    const [, m] = plan.meeting;
    const [o, e] = plan.outro;
    const d = sec(FADE_FRAMES);
    // xfade bắt đầu chuyển khi pts khung của đoạn đầu >= offset. Đặt offset đúng khung thứ m - FADE_FRAMES rồi làm tròn 4 chữ số
    // thì có lúc làm tròn lên, khung đó bị coi là chưa chuyển và video thừa một khung (gặp ở bản en): lùi nửa khung cho chắc.
    graph = [
      `[0:v]trim=start_frame=0:end_frame=${m},setpts=PTS-STARTPTS[v1]`,
      `[0:v]trim=start_frame=${o}:end_frame=${e},setpts=PTS-STARTPTS[v2]`,
      `[v1][v2]xfade=transition=fade:duration=${d}:offset=${sec(m - FADE_FRAMES - 0.5)},${TAIL}[v]`,
      `[0:a]atrim=start=0:end=${sec(m)},asetpts=PTS-STARTPTS[a1]`,
      `[0:a]atrim=start=${sec(o)}:end=${sec(e)},asetpts=PTS-STARTPTS[a2]`,
      `[a1][a2]acrossfade=d=${d}[a]`,
    ];
  } else {
    const [c, e] = plan.chat;
    graph = [
      `[0:v]trim=start_frame=${c}:end_frame=${e},setpts=PTS-STARTPTS,fade=t=in:st=0:d=${FADE_IN_S},${TAIL}[v]`,
      `[0:a]atrim=start=${sec(c)}:end=${sec(e)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${FADE_IN_S}[a]`,
    ];
  }
  return [
    "-y", "-loglevel", "error",
    "-i", input,
    "-filter_complex", graph.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", "-f", "mp4", output,
  ];
}

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} thoát với mã ${code}`))));
  });

/** Số khung hình và có tiếng hay không của một file MP4, đọc bằng ffprobe. */
function probe(file) {
  const out = (select, entries) =>
    execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", select, "-show_entries", entries, "-of", "csv=p=0", file], { encoding: "utf8" }).trim();
  return { frames: Number(out("v:0", "stream=nb_read_frames")), audio: out("a:0", "stream=codec_name") !== "" };
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../..");
  const out = path.join(root, "target/demo-video");
  const site = path.join(root, "website/src/assets/video");
  const { values: opts } = parseArgs({ options: { lang: { type: "string", default: "vi,en,ja,zh,ko" }, publish: { type: "boolean", default: false } } });
  const json = (file) => JSON.parse(readFileSync(path.join(here, file), "utf8"));
  const LIMIT = 25 * 1024 * 1024;
  for (const lang of opts.lang.split(",")) {
    const name = `desktop.${lang}`;
    const script = json(`script.${name}.json`);
    const data = dataName(script, name);
    const tl = buildDesktopTimeline(script, json(`data/voice.${voiceName(script, name)}.json`), json(`data/live.${data}.json`), json(`data/compose.${data}.json`));
    const input = path.join(out, `ai-translator-demo.${name}.mp4`);
    // -shortest của render.mjs có thể làm video ngắn hơn lịch một khung: lấy số khung thật của file.
    const plan = splitPlan({ ...tl, frames: Math.min(tl.frames, probe(input).frames) });
    for (const kind of KINDS) {
      const mp4 = path.join(out, `ai-translator-${kind}.${lang}.mp4`);
      await run("ffmpeg", ffmpegArgs(kind, plan, input, `${mp4}.part`));
      const got = probe(`${mp4}.part`);
      const want = clipFrames(plan, kind);
      if (got.frames !== want) throw new Error(`${kind}.${lang}: ${got.frames} khung, dự kiến ${want}`);
      if (!got.audio) throw new Error(`${kind}.${lang}: mất tiếng`);
      if (statSync(`${mp4}.part`).size >= LIMIT) throw new Error(`${kind}.${lang}: vượt 25 MiB`);
      renameSync(`${mp4}.part`, mp4);
      console.log(`${path.relative(root, mp4)}  ${got.frames} khung (${(got.frames / FPS).toFixed(1)} s)`);
      if (opts.publish) {
        mkdirSync(site, { recursive: true });
        copyFileSync(mp4, path.join(site, `ai-translator-${kind}.${lang}.mp4`));
        execFileSync("cwebp", ["-quiet", "-q", "80", "-resize", "1440", "900", path.join(out, `keyframes.${name}`, `${POSTER_FRAME[kind]}.png`), "-o", path.join(site, `ai-translator-${kind}.${lang}.webp`)]);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
