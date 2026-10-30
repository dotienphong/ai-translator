#!/usr/bin/env node
// Kiểm bản phát hành (kế hoạch 07a). Chạy được trên macOS và Windows, chỉ cần Node 24, không gói npm nào.
//
//   node scripts/release/release-check.mjs table <thư mục binaries> --target <triple> [--out <file.json>]
//       Bảng SHA-256 của mọi file trong thư mục tiến trình phụ, kèm tên sau khi đóng gói (Đ15 của kế hoạch 00).
//   node scripts/release/release-check.mjs bundle <thư mục binaries> <thư mục chứa file chạy trong bản đóng gói> --target <triple>
//       Mỗi file trong binaries/ có mặt trong bản đóng gói, đúng tên sau khi đóng gói, đúng SHA-256 (app so với bảng build
//       sẵn); bản đóng gói không có thư viện nào khác (spec §10.2).
//   node scripts/release/release-check.mjs embedded <thư mục binaries> <file chạy của app> --target <triple>
//       File chạy của app mang đúng bảng SHA-256 build sẵn: có SHA-256 của mọi file trong binaries/, và không còn tên bản
//       dev kèm triple (build.rs ghi tên sau khi đóng gói ở bản phát hành).
//   node scripts/release/release-check.mjs no-dev-gate <file chạy của app>...
//       File chạy của app (bản phát hành) không có mã công tắc dev: tên biến AI_TRANSLATOR_DEV_PRO, tên biến cũ
//       AI_TRANSLATOR_DEV_FREE, chuỗi chim hoàng yến mt-dev-pro-gate-v1 (spec 2026-10-04, §3). Có một chuỗi là lỗi.
//   node scripts/release/release-check.mjs deps-macos <file>... [--min-os 14.2]
//       Mọi thư viện mà file Mach-O nạp đều là của hệ thống (/System/Library, /usr/lib), và bản macOS tối thiểu của file
//       không cao hơn --min-os.
//   node scripts/release/release-check.mjs deps-windows <file>... [--no-local-libs]
//       Đọc `dumpbin /dependents`: file nào cần C runtime của Visual C++ (VCRUNTIME, MSVCP, VCOMP; C9 của kế hoạch 00) thì
//       DLL đó phải nằm cạnh file (đóng kèm, bản không phải debug), không được trông vào máy khách; với --no-local-libs
//       (asr-worker, link CRT tĩnh), không file nào được cần C runtime và không DLL nào nằm cạnh file, nên không có DLL
//       ggml (C11).
//   node scripts/release/release-check.mjs size <file> --max-bytes <số>
//       Dung lượng bộ cài không vượt ngưỡng (spec §6.11: 60 MB, tính 60 000 000 byte).
//   node scripts/release/release-check.mjs sha256sums <file>... --out <file>
//       Dòng `<sha256>  <tên file>` cho từng bộ cài, để website công bố (spec §10.2).
//
// Lỗi thì in lý do ra stderr và thoát mã 1.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Tên sau khi đóng gói: bỏ hậu tố `-<target>` (trước `.exe` nếu có). Cùng luật với `src-tauri/src/sidecar/bundled_name.rs`. */
export function bundledName(file, target) {
  const exe = file.endsWith(".exe") ? ".exe" : "";
  const stem = exe ? file.slice(0, -exe.length) : file;
  const suffix = `-${target}`;
  if (stem.endsWith(suffix) && stem.length > suffix.length) return stem.slice(0, -suffix.length) + exe;
  return file;
}

/** Tên có dạng thư viện mà hệ điều hành hay `llama-server` có thể nạp. Cùng luật với `integrity::looks_like_library`. */
export function looksLikeLibrary(name) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".dll") ||
    lower.endsWith(".dylib") ||
    lower.endsWith(".so") ||
    lower.includes(".so.") ||
    lower.startsWith("libggml-") ||
    lower.startsWith("ggml-")
  );
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function filesIn(dir) {
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort();
}

/** Bảng SHA-256 của thư mục tiến trình phụ. */
export function sidecarTable(dir, target) {
  return filesIn(dir).map((file) => {
    const path = join(dir, file);
    return { file, bundled: bundledName(file, target), bytes: statSync(path).size, sha256: sha256File(path) };
  });
}

/** Lỗi khi so bản đóng gói với binaries/. Trả mảng câu lỗi, rỗng là đạt. */
export function checkBundle(binariesDir, bundleDir, target) {
  const errors = [];
  const table = sidecarTable(binariesDir, target);
  if (table.length === 0) errors.push(`${binariesDir} không có file nào`);
  const expected = new Set();
  for (const row of table) {
    expected.add(row.bundled);
    const path = join(bundleDir, row.bundled);
    if (!existsSync(path)) {
      errors.push(`thiếu ${row.bundled} trong bản đóng gói`);
    } else if (sha256File(path) !== row.sha256) {
      errors.push(`${row.bundled} khác bản trong binaries/ (${row.file}), bảng SHA-256 build sẵn sẽ không khớp`);
    }
  }
  for (const name of filesIn(bundleDir)) {
    if (looksLikeLibrary(name) && !expected.has(name)) errors.push(`thư viện lạ trong bản đóng gói: ${name}`);
  }
  return errors;
}

/** Lỗi khi file chạy của app (nội dung `binary`) không mang đúng bảng `table` (kết quả của `sidecarTable`). */
export function embeddedErrors(binary, table) {
  const errors = [];
  for (const row of table) {
    if (!binary.includes(Buffer.from(row.sha256))) errors.push(`file chạy của app không có SHA-256 của ${row.file}`);
    if (row.file !== row.bundled && binary.includes(Buffer.from(row.file))) {
      errors.push(`file chạy của app còn tên bản dev ${row.file}: bảng SHA-256 không dùng tên sau khi đóng gói`);
    }
  }
  return errors;
}

/**
 * Chuỗi chỉ có trong bản debug: công tắc Pro của dev (`src-tauri/src/pro.rs`: tên biến công tắc, tên biến cũ, chuỗi chim hoàng yến),
 * công tắc tự gửi báo cáo lỗi của dev (`src-tauri/src/diagnostics/mod.rs`, spec 2026-10-17) và cờ bật nhận giọng của dev
 * (`src-tauri/src/speaker/mod.rs`, spec 2026-10-26-phan-biet-nguoi-noi, kế hoạch 02).
 */
export const DEV_GATE_MARKERS = [
  "AI_TRANSLATOR_DEV_PRO",
  "AI_TRANSLATOR_DEV_FREE",
  "mt-dev-pro-gate-v1",
  "AI_TRANSLATOR_DEV_REPORTS",
  "AI_TRANSLATOR_DEV_SPEAKER",
];

/** Lỗi khi file chạy của app (nội dung `binary`) còn mã công tắc dev. Quét cả UTF-8 lẫn UTF-16LE (chuỗi của Windows). */
export function devGateErrors(binary) {
  return DEV_GATE_MARKERS.filter(
    (marker) => binary.includes(Buffer.from(marker)) || binary.includes(Buffer.from(marker, "utf16le")),
  ).map((marker) => `file chạy của app còn mã dev: có chuỗi ${marker}`);
}

/** Thư viện trong output của `otool -L <file>` (bỏ dòng đầu là tên file). */
export function parseOtoolLibraries(text) {
  return text
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/ \(compatibility version .*\)$/, ""));
}

/** Bản macOS tối thiểu (`minos`) trong output của `otool -l <file>`, hoặc null. */
export function parseOtoolMinOs(text) {
  const match = text.match(/cmd LC_BUILD_VERSION[\s\S]*?\n\s*minos (\S+)/);
  return match ? match[1] : null;
}

function versionLe(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return true;
}

/** Lỗi của một file Mach-O: thư viện ngoài hệ thống, hoặc `minos` khác `minOs` (cao hơn: máy cũ không chạy; thấp hơn: xem dưới). */
export function macosErrors(file, libraries, minos, minOs) {
  const errors = [];
  for (const lib of libraries) {
    if (!lib.startsWith("/System/Library/") && !lib.startsWith("/usr/lib/")) {
      errors.push(`${file} nạp thư viện ngoài hệ thống: ${lib}`);
    }
  }
  if (minos === null) errors.push(`${file} không có LC_BUILD_VERSION`);
  else if (!versionLe(minos, minOs)) errors.push(`${file} cần macOS ${minos}, cao hơn ${minOs}`);
  // Thấp hơn cũng là lỗi: `minos` là bản rustc ghi lúc link, còn mã C/ObjC bên trong (ggml) biên dịch theo MACOSX_DEPLOYMENT_TARGET.
  // asr-worker từng ra minos 11.0 vì cargo không đặt biến này, ggml biên dịch theo SDK nên liên kết cứng với API của macOS 15
  // và dyld từ chối nạp trên macOS 14 (báo cáo R-7048-CH57).
  else if (!versionLe(minOs, minos)) {
    errors.push(
      `${file} có minos ${minos}, thấp hơn ${minOs}: build chưa đặt MACOSX_DEPLOYMENT_TARGET=${minOs} nên mã bên trong có thể liên kết cứng với API mới hơn`,
    );
  }
  return errors;
}

/** Ký hiệu bind trong output của `dyld_info -fixups <file>`: `{ symbol, weak }`. */
export function parseDyldInfoBinds(text) {
  const binds = [];
  for (const line of text.split("\n")) {
    const match = line.match(/\bbind\s+[^\s/]+\/(\S+?)(\s+\[weak-import\])?\s*$/);
    if (match) binds.push({ symbol: match[1], weak: match[2] !== undefined });
  }
  return binds;
}

/** Ký hiệu hệ thống chỉ có từ macOS mới hơn 14.2: nếu bị bind cứng thì dyld từ chối nạp file trên macOS 14.2. */
const NEWER_THAN_14_2 = new Map([["_OBJC_CLASS_$_MTLResidencySetDescriptor", "macOS 15"]]);

/** Lỗi khi một file bind cứng (không `[weak-import]`) tới ký hiệu chỉ có từ macOS mới hơn mức tối thiểu. */
export function newApiErrors(file, binds) {
  return binds
    .filter((b) => !b.weak && NEWER_THAN_14_2.has(b.symbol))
    .map((b) => `${file} liên kết cứng với ${b.symbol} (chỉ có từ ${NEWER_THAN_14_2.get(b.symbol)}): macOS 14.2 sẽ không nạp được file`);
}

/** DLL trong output của `dumpbin /dependents <file>`: các dòng giữa "Image has the following dependencies:" và "Summary". */
export function parseDumpbinDependents(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /Image has the following (delay load )?dependencies:/.test(line));
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (/^Summary$/.test(trimmed)) break;
    if (/Image has the following delay load dependencies:/.test(trimmed)) continue;
    if (/\.dll$/i.test(trimmed)) out.push(trimmed);
  }
  return out;
}

const VC_RUNTIME = /^(vcruntime|msvcp|vcomp|concrt|vccorlib|ucrtbased)\d*.*\.dll$/i;

/** DLL là C runtime của Visual C++ (bản phát hành hay debug). */
export function isVcRuntime(name) {
  return VC_RUNTIME.test(name);
}

/**
 * Lỗi của một file PE. C runtime của Visual C++ mà file cần chỉ chấp nhận khi DLL đó nằm cạnh file (đóng kèm trong bản cài,
 * không trông vào máy khách) và không phải bản debug; với `noLocalLibs` (asr-worker, CRT tĩnh) thì luôn là lỗi, và có DLL
 * nằm cạnh file (trong `localDlls`) cũng là lỗi.
 */
export function windowsErrors(file, dlls, localDlls, noLocalLibs) {
  const errors = [];
  const local = new Set(localDlls.map((name) => name.toLowerCase()));
  for (const dll of dlls) {
    if (VC_RUNTIME.test(dll)) {
      const bundled = !noLocalLibs && local.has(dll.toLowerCase()) && !/d\.dll$/i.test(dll);
      if (!bundled) errors.push(`${file} cần C runtime của Visual C++: ${dll}`);
    }
    if (noLocalLibs && local.has(dll.toLowerCase())) errors.push(`${file} nạp DLL nằm cạnh nó: ${dll}`);
  }
  return errors;
}

const NETWORK_DLL = /^(ws2_32|wsock32|mswsock|winhttp|wininet|webio|websocket|urlmon|iphlpapi|dnsapi|httpapi|netapi32)\.dll$/i;

/** Lỗi khi file PE nhập DLL mạng (`--no-network`: speaker-worker và onnxruntime.dll, spec 2026-10-26-phan-biet-nguoi-noi §10). */
export function networkErrors(file, dlls) {
  return dlls.filter((dll) => NETWORK_DLL.test(dll)).map((dll) => `${file} nhập DLL mạng: ${dll}`);
}

export function checkSize(bytes, maxBytes) {
  return bytes <= maxBytes ? [] : [`${bytes} byte, vượt ngưỡng ${maxBytes} byte`];
}

function option(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

function required(value, name) {
  if (value === undefined) throw new Error(`thiếu ${name}`);
  return value;
}

export function main(argv) {
  const args = [...argv];
  const command = args.shift();
  const errors = [];
  switch (command) {
    case "table": {
      const target = required(option(args, "--target"), "--target");
      const out = option(args, "--out");
      const table = sidecarTable(required(args[0], "thư mục binaries"), target);
      const json = `${JSON.stringify(table, null, 2)}\n`;
      if (out) writeFileSync(out, json);
      else process.stdout.write(json);
      break;
    }
    case "bundle": {
      const target = required(option(args, "--target"), "--target");
      errors.push(...checkBundle(required(args[0], "thư mục binaries"), required(args[1], "thư mục đóng gói"), target));
      if (errors.length === 0) console.log(`bản đóng gói khớp ${filesIn(args[0]).length} file của binaries/`);
      break;
    }
    case "embedded": {
      const target = required(option(args, "--target"), "--target");
      const table = sidecarTable(required(args[0], "thư mục binaries"), target);
      errors.push(...embeddedErrors(readFileSync(required(args[1], "file chạy của app")), table));
      if (errors.length === 0) console.log(`${basename(args[1])} mang bảng SHA-256 của ${table.length} file, đúng tên sau khi đóng gói`);
      break;
    }
    case "no-dev-gate": {
      if (args.length === 0) throw new Error("thiếu file chạy của app");
      for (const file of args) {
        const found = devGateErrors(readFileSync(file));
        errors.push(...found.map((e) => `${basename(file)}: ${e}`));
        if (found.length === 0) console.log(`${basename(file)}: không có mã công tắc dev`);
      }
      break;
    }
    case "deps-macos": {
      const minOs = option(args, "--min-os") ?? "14.2";
      for (const file of args) {
        const libs = parseOtoolLibraries(execFileSync("otool", ["-L", file], { encoding: "utf8" }));
        const minos = parseOtoolMinOs(execFileSync("otool", ["-l", file], { encoding: "utf8" }));
        errors.push(...macosErrors(basename(file), libs, minos, minOs));
        // llama-server ra khoảng 1,6 MB, hơn maxBuffer mặc định (1 MiB): không nâng thì ENOBUFS dù binary đúng.
        const fixups = execFileSync("xcrun", ["dyld_info", "-fixups", file], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
        const binds = parseDyldInfoBinds(fixups);
        errors.push(...newApiErrors(basename(file), binds));
        console.log(`${basename(file)}: minos ${minos}; ${libs.join(", ")}`);
      }
      break;
    }
    case "deps-windows": {
      const noLocalLibs = flag(args, "--no-local-libs");
      const noNetwork = flag(args, "--no-network");
      for (const file of args) {
        const dlls = parseDumpbinDependents(execFileSync("dumpbin", ["/nologo", "/dependents", file], { encoding: "utf8" }));
        const dir = join(file, "..");
        const localDlls = filesIn(dir).filter((name) => name.toLowerCase().endsWith(".dll"));
        errors.push(...windowsErrors(basename(file), dlls, localDlls, noLocalLibs));
        if (noNetwork) errors.push(...networkErrors(basename(file), dlls));
        console.log(`${basename(file)}: ${dlls.join(", ")}`);
      }
      break;
    }
    case "size": {
      const maxBytes = Number(required(option(args, "--max-bytes"), "--max-bytes"));
      const file = required(args[0], "file");
      const bytes = statSync(file).size;
      console.log(`${basename(file)}: ${bytes} byte (${(bytes / 1e6).toFixed(1)} MB), ngưỡng ${maxBytes} byte`);
      errors.push(...checkSize(bytes, maxBytes));
      break;
    }
    case "sha256sums": {
      const out = required(option(args, "--out"), "--out");
      const lines = args.map((file) => `${sha256File(file)}  ${basename(file)}\n`);
      writeFileSync(out, lines.join(""));
      process.stdout.write(lines.join(""));
      break;
    }
    default:
      throw new Error(`lệnh không rõ: ${command ?? "(trống)"}`);
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const errors = main(process.argv.slice(2));
    for (const error of errors) console.error(`LỖI: ${error}`);
    process.exitCode = errors.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
