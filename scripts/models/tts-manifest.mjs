#!/usr/bin/env node
// Dựng phần thân manifest model số kế tiếp có (hay không còn) khóa gốc `tts` (gói model giọng đọc; spec 2026-11-02-doc-ban-dich-tts-design §8).
// Như `speaker-manifest.mjs`: khóa nằm ở gốc, ngoài `files`, nên app cũ bỏ qua; lệnh không chạm mạng hay R2, chỉ ghi
// `scripts/models/released/body-<N+1>.json` (phần thân chưa ký). Mục `tts` do `scripts/release/tts-pack-entry.mjs` tạo (SHA-256 từng file).
//
//   node scripts/models/tts-manifest.mjs add --entry <tts-entry.json> [--released-dir <thư mục>]
//   node scripts/models/tts-manifest.mjs remove [--released-dir <thư mục>]   # tắt khẩn: manifest mới không còn `tts`
//
// `pnpm models:update` giữ nguyên các khóa gốc của bản đang phát hành (`bumpBody` trải `...prev`), nên các lượt cập nhật model
// về sau không làm mất mục `tts`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO } from "./lib.mjs";
import { bumpBody, latestBody, publishedAtNow, serializeJson } from "./update-lib.mjs";

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const MAX_FILE_BYTES = 2 * 2 ** 30; // như MAX_TTS_FILE_BYTES của src-tauri/src/models/manifest.rs
const MAX_BYTES = 3 * 2 ** 30; // như MAX_TTS_BYTES

/** Kiểm mục `tts` theo luật của app (`Manifest::tts_pack`); ném lỗi nêu trường sai. */
export function checkTtsEntry(entry) {
  const files = Array.isArray(entry?.files) ? entry.files : [];
  const paths = new Set();
  const unique = files.every((f) => !paths.has(String(f.path).toLowerCase()) && paths.add(String(f.path).toLowerCase()));
  const okPath = (p) => typeof p === "string" && p.length <= 256 && p.split("/").length <= 4 && p.split("/").every((s) => SEGMENT.test(s) && !/^\.+$/.test(s) && !/\.(part|tmp)$/i.test(s));
  const okUrl = (u) => typeof u === "string" && u.length <= 512 && u.split("/").every((s) => SEGMENT.test(s) && !/^\.+$/.test(s));
  const bad = [
    ["id", /^[a-z0-9][a-z0-9._-]{0,63}$/.test(entry?.id ?? "")],
    ["version", typeof entry?.version === "string" && entry.version.length > 0 && entry.version.length <= 32],
    ["license_id", typeof entry?.license_id === "string" && entry.license_id.trim().length > 0 && entry.license_id.length <= 64],
    ["min_app_version", VERSION.test(entry?.min_app_version ?? "")],
    ["files", files.length > 0 && files.length <= 64 && unique],
    ["files.path", files.every((f) => okPath(f.path))],
    ["files.url", files.every((f) => okUrl(f.url))],
    ["files.bytes", files.every((f) => Number.isSafeInteger(f.bytes) && f.bytes > 0 && f.bytes <= MAX_FILE_BYTES)],
    ["bytes", files.reduce((n, f) => n + f.bytes, 0) <= MAX_BYTES],
    ["files.sha256", files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))],
  ].find(([, ok]) => !ok);
  if (bad) throw new Error(`mục tts không hợp lệ ở trường ${bad[0]}`);
  return entry;
}

/** Phần thân số mới có mục `tts`; từ chối khi bản đang chạy đã có `tts` (đổi model là việc riêng). */
export function withTts(prev, entry, publishedAt) {
  if (prev.tts) throw new Error(`manifest số ${prev.sequence} đã có mục tts (id ${prev.tts.id}); đổi model là việc riêng, không dùng lệnh này.`);
  const next = bumpBody(prev, {}, publishedAt);
  next.tts = checkTtsEntry(entry);
  return next;
}

/** Phần thân số mới không còn `tts`: app thôi tải và dùng gói giọng đọc từ lần nhận manifest kế tiếp (tắt khẩn). */
export function withoutTts(prev, publishedAt) {
  if (!prev.tts) throw new Error(`manifest số ${prev.sequence} không có mục tts: không có gì để bỏ.`);
  const next = bumpBody(prev, {}, publishedAt);
  delete next.tts;
  return next;
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith("--") || rest[i + 1] === undefined) throw new Error(`Tham số không hợp lệ: ${rest.slice(i).join(" ")}`);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  if (mode !== "add" && mode !== "remove") throw new Error("Dùng: tts-manifest.mjs add --entry <tts-entry.json> | remove");
  return { mode, opts };
}

export function run(argv, { releasedDir = resolve(REPO, "scripts/models/released"), now = new Date(), log = console.log } = {}) {
  const { mode, opts } = parseArgs(argv);
  releasedDir = opts["released-dir"] ? resolve(opts["released-dir"]) : releasedDir;
  const latest = latestBody(releasedDir);
  const prev = JSON.parse(readFileSync(latest.path, "utf8"));
  const publishedAt = publishedAtNow(now);
  let next;
  if (mode === "add") {
    if (!opts.entry || !existsSync(opts.entry)) throw new Error("Thiếu --entry hay file mục tts không có.");
    next = withTts(prev, JSON.parse(readFileSync(opts.entry, "utf8")), publishedAt);
    const total = next.tts.files.reduce((n, f) => n + f.bytes, 0);
    log(`Mục tts: ${next.tts.files.length} file, ${total} byte; app >= ${next.tts.min_app_version} sẽ tự tải. File phải có sẵn trên R2 ở models/<url> (SHA-256 đã kiểm bằng tts-pack-entry.mjs).`);
  } else {
    next = withoutTts(prev, publishedAt);
    log("Bản này BỎ mục tts: app thôi tải và dùng gói giọng đọc sau khi nhận manifest.");
  }
  const out = join(releasedDir, `body-${next.sequence}.json`);
  if (existsSync(out)) throw new Error(`${out} đã có; không ghi đè.`);
  writeFileSync(out, serializeJson(next));
  log(`Đã ghi ${out} (manifest số ${next.sequence}, trước đó số ${prev.sequence}).`);
  log(`Tiếp: ký bằng workflow \`Sign model manifest\` (body=scripts/models/released/body-${next.sequence}.json, previous=scripts/models/released/body-${prev.sequence}.json), rồi tải models.json đã ký lên R2.`);
  return { prev, next, path: out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
