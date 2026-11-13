#!/usr/bin/env node
// Dựng phần thân manifest model số kế tiếp có (hay không còn) khóa gốc `notes` (spec 2026-11-11-ghi-chu-cuoc-hop §4; kế hoạch 05
// Task 3). `notes` là gói model ghi chú chạy trên máy, ở gốc phần thân, ngoài `files`: app cũ bỏ qua khóa lạ ở gốc, còn một `kind`
// lạ trong `files` thì làm app từ chối cả manifest (như `speaker`). Lệnh này không chạm mạng hay R2; nó chỉ ghi
// `scripts/models/released/body-<N+1>.json` (phần thân chưa ký) và in các việc tiếp theo cho người vận hành.
//
//   node scripts/models/notes-manifest.mjs add --file <model.gguf> --min-app-version x.y.z [--min-ram-mib N] [--ctx N] [--released-dir <thư mục>]
//   node scripts/models/notes-manifest.mjs remove [--released-dir <thư mục>]   # tắt khẩn: manifest mới không còn `notes`
//
// `--released-dir` (mặc định `scripts/models/released`) để thử ở thư mục tạm mà không ghi vào repo.
//
// Luật kiểm là luật của `Manifest::notes_entry` (src-tauri/src/models/manifest.rs): mục sai thì app bỏ ghi chú trên máy một cách
// im lặng, nên lệnh này từ chối ngay ở đây, kể cả id hay tên file trùng một mục của `files` hay `speaker`. Khác `speaker-manifest`:
// `add` lần hai THAY mục `notes` cũ (đổi model hay đổi ngưỡng là việc thường), không từ chối.
//
// `pnpm models:update` giữ nguyên các khóa gốc của bản đang phát hành (`bumpBody` trải `...prev`), nên sau lệnh `add`, các lượt
// cập nhật model về sau không làm mất mục `notes`.
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO } from "./lib.mjs";
import { bumpBody, latestBody, publishedAtNow, serializeJson } from "./update-lib.mjs";

export const NOTES_ID = "notes-qwen35-4b";
const MAX_BYTES = 4 * 1024 ** 3; // như MAX_NOTES_BYTES (4 << 30) của manifest.rs
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const STORE_FILES = ["manifest.json", "installed.json", "state.json"]; // tên file của chính kho model (`STORE_FILES` của manifest.rs)
const WINDOWS_DEVICES = new Set(["con", "prn", "aux", "nul", ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`)]);

function safeFileName(name) {
  const lower = name.toLowerCase();
  return (
    SAFE_NAME.test(name) &&
    !name.endsWith(".") &&
    !lower.endsWith(".part") &&
    !lower.endsWith(".tmp") &&
    !STORE_FILES.includes(lower) &&
    !WINDOWS_DEVICES.has(lower.split(".")[0])
  );
}

/** Mục `notes` từ file model trên máy: `url` tương đối so với `models/`, thư mục theo 12 ký tự đầu của SHA-256. */
export function notesEntry({ file, bytes, sha256, version, minAppVersion, minRamMib = 15360, ctx = 16384, licenseId = "Apache-2.0" }) {
  const name = basename(file);
  const entry = {
    id: NOTES_ID,
    version,
    file: name,
    url: `notes/${String(sha256).slice(0, 12)}/${name}`,
    bytes,
    sha256,
    license_id: licenseId,
    min_app_version: minAppVersion,
    min_ram_mib: minRamMib,
    ctx,
  };
  // Cùng thứ tự kiểm với `notes_entry` của manifest.rs: trường sai đầu tiên là trường được nêu.
  const bad = [
    ["version", typeof version === "string" && version.length > 0 && version.length <= 32],
    ["file", safeFileName(name)],
    ["url", entry.url.split("/").every((s) => SEGMENT.test(s) && s !== "." && s !== "..")],
    ["bytes", Number.isSafeInteger(bytes) && bytes > 0 && bytes <= MAX_BYTES],
    ["sha256", typeof sha256 === "string" && /^[0-9a-f]{64}$/.test(sha256)],
    ["license_id", typeof licenseId === "string" && licenseId.trim().length > 0 && licenseId.length <= 64],
    ["min_app_version", VERSION.test(minAppVersion ?? "")],
    ["min_ram_mib", Number.isInteger(minRamMib) && minRamMib >= 8192 && minRamMib <= 65536],
    ["ctx", Number.isInteger(ctx) && ctx >= 8192 && ctx <= 32768],
  ].find(([, ok]) => !ok);
  if (bad) throw new Error(`mục notes không hợp lệ ở trường ${bad[0]}`);
  return entry;
}

/** Phần thân số mới có mục `notes` (thay mục cũ nếu có), mọi khóa gốc khác giữ nguyên; từ chối khi id hay tên file trùng `files`/`speaker`. */
export function withNotes(prev, entry, publishedAt) {
  const file = entry.file.toLowerCase();
  const takenBySpeaker = prev.speaker && (prev.speaker.id === entry.id || String(prev.speaker.file ?? "").toLowerCase() === file);
  if (takenBySpeaker || prev.files.some((f) => f.id === entry.id || String(f.file).toLowerCase() === file)) {
    throw new Error(`id hay tên file của mục notes trùng một mục trong \`files\` hay \`speaker\` của manifest số ${prev.sequence}.`);
  }
  const next = bumpBody(prev, {}, publishedAt);
  next.notes = entry;
  return next;
}

/** Phần thân số mới không còn `notes`: app thôi dùng gói ghi chú trên máy từ lần đọc manifest kế tiếp (tắt khẩn). */
export function withoutNotes(prev, publishedAt) {
  if (!prev.notes) throw new Error(`manifest số ${prev.sequence} không có mục notes: không có gì để bỏ.`);
  const next = bumpBody(prev, {}, publishedAt);
  delete next.notes;
  return next;
}

function sha256File(path) {
  return new Promise((ok, err) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => ok(hash.digest("hex")))
      .on("error", err);
  });
}

const USAGE = "Dùng: notes-manifest.mjs add --file <model.gguf> --min-app-version <x.y.z> [--min-ram-mib N] [--ctx N] [--released-dir <thư mục>] | remove [--released-dir <thư mục>]";

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith("--") || rest[i + 1] === undefined) throw new Error(`Tham số không hợp lệ: ${rest.slice(i).join(" ")}`);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  if (mode !== "add" && mode !== "remove") throw new Error(USAGE);
  return { mode, opts };
}

/** Số nguyên từ tham số dòng lệnh; chữ không phải số nguyên thì thành NaN để `notesEntry` nêu đúng trường. */
const intOpt = (text) => (text === undefined ? undefined : /^\d+$/.test(text) ? Number(text) : Number.NaN);

export async function run(argv, { releasedDir = resolve(REPO, "scripts/models/released"), now = new Date(), log = console.log } = {}) {
  const { mode, opts } = parseArgs(argv);
  releasedDir = opts["released-dir"] ? resolve(opts["released-dir"]) : releasedDir;
  const latest = latestBody(releasedDir);
  const prev = JSON.parse(readFileSync(latest.path, "utf8"));
  const publishedAt = publishedAtNow(now);
  let next;
  if (mode === "add") {
    if (!opts.file || !existsSync(opts.file)) throw new Error("Thiếu --file hay file model không có.");
    const sha256 = await sha256File(opts.file);
    const bytes = statSync(opts.file).size;
    const entry = notesEntry({
      file: opts.file,
      bytes,
      sha256,
      version: opts.version ?? "1",
      minAppVersion: opts["min-app-version"],
      ...(opts["min-ram-mib"] !== undefined ? { minRamMib: intOpt(opts["min-ram-mib"]) } : {}),
      ...(opts.ctx !== undefined ? { ctx: intOpt(opts.ctx) } : {}),
      ...(opts["license-id"] !== undefined ? { licenseId: opts["license-id"] } : {}),
    });
    next = withNotes(prev, entry, publishedAt);
    log(`Tải lên R2 (rclone hay wrangler, như mục 13 của runbook): ${opts.file}  ->  models/${entry.url}`);
    log(`  SHA-256 ${entry.sha256}, ${entry.bytes} byte; tải cả giấy phép lên cùng thư mục models/notes/${entry.sha256.slice(0, 12)}/.`);
  } else {
    next = withoutNotes(prev, publishedAt);
    log("Bản này BỎ mục notes: app thôi dùng gói ghi chú trên máy từ lần đọc manifest kế tiếp (ghi chú qua cloud không đổi).");
  }
  const out = join(releasedDir, `body-${next.sequence}.json`);
  if (existsSync(out)) throw new Error(`${out} đã có; không ghi đè.`);
  writeFileSync(out, serializeJson(next));
  log(`Đã ghi ${out} (manifest số ${next.sequence}, trước đó số ${prev.sequence}).`);
  log(`Tiếp: ký bằng workflow \`Sign model manifest\` (body=scripts/models/released/body-${next.sequence}.json, previous=scripts/models/released/body-${prev.sequence}.json), rồi tải models.json đã ký lên R2 (runbook mục 16).`);
  return { prev, next, path: out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(2);
  });
}
