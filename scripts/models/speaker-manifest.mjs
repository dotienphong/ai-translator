#!/usr/bin/env node
// Dựng phần thân manifest model số kế tiếp có (hay không còn) khóa gốc `speaker` (spec 2026-10-26-phan-biet-nguoi-noi §4.5;
// kế hoạch 07). Khóa `speaker` và `speaker_config` nằm ở gốc phần thân, ngoài `files`: app 0.3.1 trở về trước bỏ qua khóa lạ
// ở gốc, còn một `kind` lạ trong `files` thì làm app từ chối cả manifest. Lệnh này không chạm mạng hay R2; nó chỉ ghi
// `scripts/models/released/body-<N+1>.json` (phần thân chưa ký) và in các việc tiếp theo cho người vận hành.
//
//   node scripts/models/speaker-manifest.mjs add --file <model.onnx> --min-app-version 0.3.2 [--config <speaker_config.json>] [--released-dir <thư mục>]
//   node scripts/models/speaker-manifest.mjs remove [--released-dir <thư mục>]   # tắt khẩn: manifest mới không còn `speaker` và `speaker_config`
//
// `--released-dir` (mặc định `scripts/models/released`) để thử ở thư mục tạm mà không ghi vào repo.
//
// `pnpm models:update` giữ nguyên các khóa gốc của bản đang phát hành (`bumpBody` trải `...prev`), nên sau lệnh `add`,
// các lượt cập nhật model về sau không làm mất mục `speaker`.
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO } from "./lib.mjs";
import { bumpBody, latestBody, publishedAtNow, serializeJson } from "./update-lib.mjs";

export const SPEAKER_ID = "eres2net-voxceleb";
const MAX_BYTES = 200 << 20; // như MAX_SPEAKER_BYTES của src-tauri/src/models/manifest.rs
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const VERSION = /^\d+\.\d+\.\d+$/;

/** Mục `speaker` từ file model trên máy: `url` tương đối so với `models/`, thư mục theo 12 ký tự đầu của SHA-256. */
export function speakerEntry({ file, bytes, sha256, version, minAppVersion, licenseId = "Apache-2.0" }) {
  const name = basename(file);
  const entry = {
    id: SPEAKER_ID,
    version,
    file: name,
    url: `speaker/${sha256.slice(0, 12)}/${name}`,
    bytes,
    sha256,
    license_id: licenseId,
    min_app_version: minAppVersion,
  };
  const bad = [
    ["version", typeof version === "string" && version.length > 0 && version.length <= 32],
    ["file", SAFE_NAME.test(name) && !/\.(part|tmp)$/i.test(name)],
    ["bytes", Number.isSafeInteger(bytes) && bytes > 0 && bytes <= MAX_BYTES],
    ["sha256", /^[0-9a-f]{64}$/.test(sha256)],
    ["min_app_version", VERSION.test(minAppVersion ?? "")],
    ["license_id", licenseId.trim().length > 0 && licenseId.length <= 64],
    ["url", entry.url.split("/").every((s) => SEGMENT.test(s) && s !== "." && s !== "..")],
  ].find(([, ok]) => !ok);
  if (bad) throw new Error(`mục speaker không hợp lệ ở trường ${bad[0]}`);
  return entry;
}

/** Phần thân số mới có mục `speaker` (và `speaker_config` nếu cho); từ chối khi bản đang chạy đã có `speaker`. */
export function withSpeaker(prev, entry, config, publishedAt) {
  if (prev.speaker) {
    throw new Error(`manifest số ${prev.sequence} đã có mục speaker (id ${prev.speaker.id}); đổi model là việc riêng, không dùng lệnh này.`);
  }
  if (prev.files.some((f) => f.id === entry.id || f.file.toLowerCase() === entry.file.toLowerCase())) {
    throw new Error(`id hay tên file của mục speaker trùng một file trong \`files\` của manifest số ${prev.sequence}.`);
  }
  const next = bumpBody(prev, {}, publishedAt);
  next.speaker = entry;
  if (config !== undefined) next.speaker_config = config;
  return next;
}

/** Phần thân số mới không còn `speaker` và `speaker_config`: app thôi dùng model nhận giọng từ phiên dịch kế tiếp (tắt khẩn). */
export function withoutSpeaker(prev, publishedAt) {
  if (!prev.speaker) throw new Error(`manifest số ${prev.sequence} không có mục speaker: không có gì để bỏ.`);
  const next = bumpBody(prev, {}, publishedAt);
  delete next.speaker;
  delete next.speaker_config;
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

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith("--") || rest[i + 1] === undefined) throw new Error(`Tham số không hợp lệ: ${rest.slice(i).join(" ")}`);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  if (mode !== "add" && mode !== "remove") throw new Error("Dùng: speaker-manifest.mjs add --file <model.onnx> --min-app-version <x.y.z> [--config <json>] | remove");
  return { mode, opts };
}

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
    const entry = speakerEntry({
      file: opts.file,
      bytes,
      sha256,
      version: opts.version ?? "1",
      minAppVersion: opts["min-app-version"],
      licenseId: opts["license-id"],
    });
    const config = opts.config ? JSON.parse(readFileSync(opts.config, "utf8")) : undefined;
    next = withSpeaker(prev, entry, config, publishedAt);
    log(`Tải lên R2 (rclone hay wrangler, như mục 13 của runbook): ${opts.file}  ->  models/${entry.url}`);
    log(`  SHA-256 ${entry.sha256}, ${entry.bytes} byte`);
  } else {
    next = withoutSpeaker(prev, publishedAt);
    log("Bản này BỎ mục speaker: app thôi dùng model nhận giọng từ phiên dịch sau khi nhận manifest.");
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
