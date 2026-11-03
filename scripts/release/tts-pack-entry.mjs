#!/usr/bin/env node
// Tạo mục `tts` của manifest model (src-tauri/src/models/manifest.rs, `Manifest::tts_pack`) từ thư mục model giọng đọc
// (spec 2026-11-02-doc-ban-dich-tts-design). Danh sách file lấy thẳng từ `MODEL_FILES` của src-tauri/src/tts.rs, nên app và
// manifest không lệch nhau; mỗi file được băm SHA-256 và ghi kích thước. App tải theo URL tương đối so với URL của manifest.
//
//   node scripts/release/tts-pack-entry.mjs --dir models/tts --min-app 0.5.7 [--version 1] [--id vieneu-v3-turbo]
//        [--license Apache-2.0] [--url-prefix tts/vieneu-v3-turbo-1] [--out tts-entry.json] [--upload-list]
//
//   - In (hoặc ghi ra --out) đoạn JSON để dán vào khóa `tts` của phần thân manifest (JSON chưa ký, commit trong repo).
//   - `--upload-list`: in thêm "<file trên máy> -> <đường dẫn trên R2>" (so với thư mục chứa models.json) để upload.
//   - Cùng `--version` và `--url-prefix` cho lần phát hành sau thì phải đổi: file đã phát hành không được ghi đè (app đang tải
//     dở theo SHA-256 cũ). Đổi model thì tăng `--version` (đổi cả tiền tố URL).
// Kiểm tiếp: `MANIFEST_BODY=<body.json> cargo test -p meeting-translator --lib check_manifest_body -- --ignored --nocapture`.

import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { root } from "./versions.mjs";

/** Các file model mà `tts::locate_files` đòi (mảng `MODEL_FILES` của tts.rs). */
export function modelFiles(source) {
  const block = /const MODEL_FILES: &\[&str\] = &\[([\s\S]*?)\];/.exec(source);
  if (!block) throw new Error("không thấy MODEL_FILES trong src-tauri/src/tts.rs");
  const files = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (files.length === 0) throw new Error("MODEL_FILES trống");
  return files;
}

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Tiền tố URL an toàn theo luật `is_model_url` của app: các đoạn chữ, số, `.`, `_`, `-`. */
export function urlPrefixErrors(prefix) {
  const ok = prefix.length > 0 && prefix.split("/").every((seg) => /^[A-Za-z0-9._-]+$/.test(seg) && seg !== "." && seg !== "..");
  return ok ? [] : [`--url-prefix không hợp lệ: ${prefix}`];
}

export async function buildEntry({ dir, files, id, version, license, minApp, urlPrefix }) {
  const errors = [];
  if (!/^\d+\.\d+\.\d+$/.test(minApp)) errors.push(`--min-app phải dạng x.y.z, nhận ${minApp}`);
  errors.push(...urlPrefixErrors(urlPrefix));
  if (errors.length) throw new Error(errors.join("\n"));
  const entries = [];
  for (const path of files) {
    const full = join(dir, ...path.split("/"));
    let stat;
    try {
      stat = statSync(full);
    } catch {
      throw new Error(`thiếu ${full}`);
    }
    if (!stat.isFile() || stat.size === 0) throw new Error(`${full} không phải file có nội dung`);
    entries.push({ path, url: `${urlPrefix}/${path}`, bytes: stat.size, sha256: await sha256File(full) });
  }
  return { id, version, license_id: license, min_app_version: minApp, files: entries };
}

function option(args, name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`thiếu giá trị cho ${name}`);
  return args[i + 1];
}

export async function main(args) {
  const dir = option(args, "--dir");
  const minApp = option(args, "--min-app");
  if (!dir || !minApp) throw new Error("cần --dir <thư mục model giọng đọc> và --min-app <x.y.z>");
  const id = option(args, "--id", "vieneu-v3-turbo");
  const version = option(args, "--version", "1");
  const entry = await buildEntry({
    dir,
    files: modelFiles(readFileSync(join(root, "src-tauri", "src", "tts.rs"), "utf8")),
    id,
    version,
    license: option(args, "--license", "Apache-2.0"),
    minApp,
    urlPrefix: option(args, "--url-prefix", `tts/${id}-${version}`),
  });
  const json = `${JSON.stringify(entry, null, 2)}\n`;
  const out = option(args, "--out");
  if (out) writeFileSync(out, json);
  else process.stdout.write(json);
  const total = entry.files.reduce((n, f) => n + f.bytes, 0);
  console.error(`${entry.files.length} file, ${total} byte (${(total / 2 ** 20).toFixed(0)} MiB)`);
  if (args.includes("--upload-list")) {
    for (const f of entry.files) console.error(`${join(dir, ...f.path.split("/"))} -> ${f.url}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
