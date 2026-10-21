// Clip người thật cho bản 16:10 (spec 2026-10-21-demo-video-desktop §2.2): tải clip Mixkit ghi trong assets.json về
// target/demo-video/assets/, rồi dùng ffmpeg cắt đoạn, cắt khung đúng tỉ lệ ô của người dùng clip đó trong cuộc họp, hạ cỡ và tách
// thành ảnh JPEG 30 khung/giây (target/demo-video/frames/<tên>/00001.jpg…), hay một ảnh vuông cho ảnh đại diện
// (target/demo-video/frames/<tên>.jpg). Ghi số khung của từng clip vào target/demo-video/frames/index.json (trang dựng cảnh cho clip
// chạy tới rồi lùi khi ngắn hơn cảnh họp).
//   node scripts/demo-video/assets.mjs [desktop.vi]     # tên kịch bản: lấy cỡ ô từ layout, người dùng clip từ call.people
// Trang Mixkit chặn tải thì in đường dẫn để tải tay vào target/demo-video/assets/ (đúng tên file cuối của đường tải).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { meetingTiles, pixelSize } from "./desktop-layout.mjs";
import { buildDesktopTimeline } from "./desktop-timeline.mjs";
import { FPS } from "./timeline.mjs";

const MIXKIT_FILE = /^https:\/\/assets\.mixkit\.co\/videos\/\d+\/\d+-(360|720|1080)\.mp4$/;
const MIXKIT_PAGE = /^https:\/\/mixkit\.co\/free-stock-video\/[a-z0-9-]+\/$/;
export const STILL_PX = 320;

/** Lý do không dùng được assets.json (rỗng là dùng được). */
export function assetProblems(doc) {
  const problems = [];
  if (!doc.license?.url || !doc.license?.checked) problems.push("thiếu license.url hay license.checked");
  const names = new Set();
  for (const a of doc.items ?? []) {
    const who = a.name ?? "(không tên)";
    if (!a.name || names.has(a.name)) problems.push(`${who}: tên trống hay trùng`);
    names.add(a.name);
    if (!MIXKIT_FILE.test(a.download ?? "")) problems.push(`${who}: download phải là file mp4 của assets.mixkit.co`);
    if (!MIXKIT_PAGE.test(a.page ?? "")) problems.push(`${who}: thiếu trang nguồn trên mixkit.co`);
    if (a.kind === "video") {
      if (!(a.start >= 0) || !(a.duration > 0)) problems.push(`${who}: video cần start và duration (giây)`);
    } else if (a.kind === "still") {
      if (!(a.at >= 0)) problems.push(`${who}: ảnh cần at (giây)`);
    } else {
      problems.push(`${who}: kind phải là video hay still`);
    }
    const f = a.focus ?? {};
    if (!(f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1)) problems.push(`${who}: focus.x, focus.y phải trong [0, 1]`);
  }
  return problems;
}

/** Bộ lọc ffmpeg: cắt vùng lớn nhất có tỉ lệ của `out`, tâm gần `focus` nhất mà không ra ngoài khung, rồi hạ cỡ. */
export function cropFilter(src, out, focus) {
  const scale = Math.min(src.width / out.width, src.height / out.height);
  const w = Math.floor((out.width * scale) / 2) * 2;
  const h = Math.floor((out.height * scale) / 2) * 2;
  const x = Math.round(Math.min(src.width - w, Math.max(0, focus.x * src.width - w / 2)));
  const y = Math.round(Math.min(src.height - h, Math.max(0, focus.y * src.height - h / 2)));
  return `crop=${w}:${h}:${x}:${y},scale=${out.width}:${out.height}:flags=lanczos`;
}

function main(scriptName) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(here, "../../target/demo-video");
  const json = (file) => JSON.parse(readFileSync(path.join(here, file), "utf8"));
  const doc = json("assets.json");
  const problems = assetProblems(doc);
  if (doc.items.length === 0) problems.push("assets.json chưa có mục nào (Task 8)");
  if (problems.length > 0) {
    console.error(`assets.json chưa dùng được:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  const script = json(`script.${scriptName}.json`);
  const d = script.data;
  const tl = buildDesktopTimeline(script, json(`data/voice.${d}.json`), json(`data/live.${d}.json`), json(`data/compose.${d}.json`));

  // Tải (bỏ qua file đã có).
  mkdirSync(path.join(out, "assets"), { recursive: true });
  const fileOf = (a) => path.join(out, "assets", path.basename(new URL(a.download).pathname));
  const missing = [];
  for (const a of doc.items) {
    const file = fileOf(a);
    if (existsSync(file)) continue;
    try {
      execFileSync("curl", ["-fsSL", "-A", "Mozilla/5.0", "-o", file, a.download], { stdio: "inherit" });
    } catch {
      rmSync(file, { force: true });
      missing.push(`${a.download}  (trang: ${a.page})`);
    }
  }
  if (missing.length > 0) {
    console.error(`Không tải được, tải tay vào ${path.join(out, "assets")} rồi chạy lại:\n- ${missing.join("\n- ")}`);
    process.exit(1);
  }

  const probe = (file) => {
    const [width, height] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" })
      .trim()
      .split(",")
      .map(Number);
    return { width, height };
  };
  const tiles = meetingTiles(script.layout);
  const frames = path.join(out, "frames");
  mkdirSync(frames, { recursive: true });
  const index = {};
  for (const a of doc.items) {
    const file = fileOf(a);
    const src = probe(file);
    if (a.kind === "still") {
      const filter = cropFilter(src, { width: STILL_PX, height: STILL_PX }, a.focus);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(a.at), "-i", file, "-frames:v", "1", "-vf", filter, "-q:v", "2", path.join(frames, `${a.name}.jpg`)]);
      console.log(`  ảnh ${a.name}`);
      continue;
    }
    const seat = script.call.people.findIndex((p) => p.video === a.name);
    if (seat < 0) {
      console.log(`  bỏ qua ${a.name}: không ai trong call.people dùng clip này`);
      continue;
    }
    if (src.width < src.height) throw new Error(`${a.name}: clip quay dọc (${src.width}×${src.height}), cần clip ngang`);
    const size = pixelSize(tiles[seat], script.viewport.dpr);
    const dir = path.join(frames, a.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    const filter = `${cropFilter(src, size, a.focus)},fps=${FPS}`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(a.start), "-t", String(a.duration), "-i", file, "-an", "-vf", filter, "-q:v", "3", path.join(dir, "%05d.jpg")]);
    index[a.name] = readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
    console.log(`  clip ${a.name}: ${index[a.name]} khung ${size.width}×${size.height} (cảnh họp cần ${Math.ceil(tl.scenes.slide[1] / (1000 / FPS))} khung, thiếu thì chạy tới rồi lùi)`);
  }
  writeFileSync(path.join(frames, "index.json"), `${JSON.stringify(index, null, 1)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] ?? "desktop.vi");
