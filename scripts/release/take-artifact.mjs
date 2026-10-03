#!/usr/bin/env node
// Nhận một artifact trong job có secret (QA của review 07a lần 2). Job có secret tải artifact vào một thư mục TRỐNG ngoài
// checkout (`$RUNNER_TEMP/in/<tên>`), rồi script này chép vào chỗ dùng CHỈ các file đúng tên chờ đợi của artifact đó.
//
//   node scripts/release/take-artifact.mjs <tên artifact> <thư mục đã tải> <thư mục đích>
//
// Lý do: artifact đến từ job không secret, là job mà build script hay crate bị chiếm có thể điều khiển. Tải thẳng vào gốc
// checkout thì artifact ghi đè được script của repo sẽ chạy ngay sau đó với secret. Ở đây:
// - mỗi artifact có danh sách đường dẫn cố định (hay mẫu tên chặt cho DLL và file có số phiên bản); thiếu file bắt buộc,
//   có file lạ, thư mục lạ hay symlink thì báo lỗi và không chép gì;
// - tên file chỉ gồm chữ, số, `.`, `_`, `-`, dấu cách (không `%`, nháy, ký tự điều khiển của shell), để tên không thành một
//   phần của lệnh ký (N-1 của review 07a lần 2);
// - in danh sách file đã nhận (đường dẫn, số byte, SHA-256) vào log của job.

import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const MAC = "aarch64-apple-darwin";
const WIN = "x86_64-pc-windows-msvc";
const VERSION = String.raw`\d+\.\d+\.\d+(?:-beta\.\d+)?`;
const DLL = /^[A-Za-z0-9._-]+\.dll$/;

const mac = [`asr-worker-${MAC}`, `llama-server-${MAC}`];
const win = [`asr-worker-vulkan-${WIN}.exe`, `asr-worker-cpu-${WIN}.exe`, `llama-server-${WIN}.exe`];
const macOut = [
  "AI Translator.app.tar.gz",
  "SHA256SUMS-macos.txt",
  "sidecar-sha256-macos.json",
  "THIRD_PARTY_NOTICES-macos.txt",
  new RegExp(`^AI Translator_${VERSION}_aarch64\\.dmg$`),
];
const winOut = [
  "SHA256SUMS-windows.txt",
  "sidecar-sha256-windows.json",
  "THIRD_PARTY_NOTICES-windows.txt",
  new RegExp(`^AI Translator_${VERSION}_x64-setup\\.exe$`),
];

/**
 * Luật của từng artifact: `required` là đường dẫn phải có, `allowed` là đường dẫn hay mẫu tên (RegExp, chỉ ở thư mục gốc
 * của mẫu) được phép có thêm. Đường dẫn dùng `/`.
 */
export const RULES = {
  "macos-sidecars": { required: [...mac.map((f) => `src-tauri/binaries/${f}`), "THIRD_PARTY_NOTICES.txt"], allowed: [] },
  "macos-sidecars-signed": { required: mac, allowed: [] },
  "macos-app": { required: ["app.tar"], allowed: [] },
  "windows-sidecars": {
    required: [...win.map((f) => `src-tauri/binaries/${f}`), "THIRD_PARTY_NOTICES.txt"],
    allowed: [{ dir: "src-tauri/binaries", name: DLL }],
  },
  "windows-sidecars-signed": { required: win, allowed: [{ dir: "", name: DLL }] },
  "windows-app": { required: ["release/meeting-translator.exe", "release-work/binaries-before-build.json"], allowed: [] },
  "macos-arm64": { required: macOut.filter((x) => typeof x === "string"), allowed: [{ dir: "", name: macOut.at(-1) }] },
  "windows-x64": { required: winOut.filter((x) => typeof x === "string"), allowed: [{ dir: "", name: winOut.at(-1) }] },
  // Artifact `release` của job update-signatures: như trên, cộng chữ ký bản cập nhật (07b dùng ở job đăng bản).
  release: {
    required: [...macOut, ...winOut].filter((x) => typeof x === "string"),
    allowed: [macOut.at(-1), winOut.at(-1), /\.sig$/].map((name) => ({ dir: "", name })),
  },
};

const SAFE_NAME = /^[A-Za-z0-9._ -]+$/;

/** Mọi mục trong `dir` (đệ quy), đường dẫn tương đối dùng `/`, kèm loại. */
function walk(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = lstatSync(join(dir, name));
    if (st.isSymbolicLink()) out.push({ rel, kind: "symlink" });
    else if (st.isDirectory()) out.push({ rel, kind: "dir" }, ...walk(join(dir, name), rel));
    else if (st.isFile()) out.push({ rel, kind: "file" });
    else out.push({ rel, kind: "khác" });
  }
  return out;
}

/** Kiểm nội dung đã tải theo luật; trả `{ files, errors }`, `files` là các đường dẫn sẽ chép. */
export function plan(name, from) {
  const rule = RULES[name];
  if (!rule) return { files: [], errors: [`artifact lạ: ${name}`] };
  const entries = walk(from);
  const dirs = new Set();
  for (const p of [...rule.required, ...rule.allowed.map((a) => (a.dir ? `${a.dir}/x` : "x"))]) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const errors = [];
  const files = [];
  for (const { rel, kind } of entries) {
    const slash = rel.lastIndexOf("/");
    const dir = slash < 0 ? "" : rel.slice(0, slash);
    const base = rel.slice(slash + 1);
    if (kind === "dir") {
      if (!dirs.has(rel)) errors.push(`thư mục lạ: ${rel}`);
      continue;
    }
    if (kind !== "file") {
      errors.push(`không phải file thường (${kind}): ${rel}`);
      continue;
    }
    if (!SAFE_NAME.test(base)) {
      errors.push(`tên file có ký tự không cho phép: ${rel}`);
      continue;
    }
    const ok = rule.required.includes(rel) || rule.allowed.some((a) => a.dir === dir && a.name.test(base));
    if (ok) files.push(rel);
    else errors.push(`file lạ: ${rel}`);
  }
  for (const r of rule.required) if (!files.includes(r)) errors.push(`thiếu ${r}`);
  return { files, errors };
}

/** Chép các file của artifact `name` từ `from` vào `to`, sau khi kiểm hết. Lỗi thì không chép gì. */
export function take(name, from, to, log = console.log) {
  const { files, errors } = plan(name, from);
  if (errors.length > 0) throw new Error(`${name}: ${errors.join("; ")}`);
  for (const rel of files) {
    const dest = join(to, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(from, rel), dest);
    const data = readFileSync(dest);
    log(`nhận ${rel} (${data.length} byte, sha256 ${createHash("sha256").update(data).digest("hex")})`);
  }
  return files;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const [name, from, to] = process.argv.slice(2);
    if (!name || !from || !to) throw new Error("dùng: take-artifact.mjs <tên artifact> <thư mục đã tải> <thư mục đích>");
    take(name, from, to);
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
