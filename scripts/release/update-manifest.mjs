#!/usr/bin/env node
// Manifest cập nhật của tauri-plugin-updater (`latest.json`, dạng tĩnh) cho kênh stable và beta (spec §6.11; kế hoạch 07b).
//
//   node scripts/release/update-manifest.mjs --version <X.Y.Z[-beta.N]> --base-url <https://…/releases> \
//     --dir <thư mục có bộ cài và file .sig> [--notes-file <file>] [--pub-date <ISO 8601>] \
//     [--stable <latest.json hiện tại của stable>] [--beta <latest.json hiện tại của beta>] --out <thư mục ra>
//
// Bộ cài của mỗi bản nằm ở `<base-url>/<version>/<tên file>` (không bao giờ ghi đè), manifest của kênh ở
// `<base-url>/<stable|beta>/latest.json`. Bản có phần pre-release (`-beta.N`) chỉ vào kênh beta; bản stable vào kênh
// stable, và vào cả kênh beta khi nó mới hơn bản beta đang có (người ở kênh beta không bị kẹt ở bản beta cũ hơn).
// Chữ ký lấy nguyên văn từ file `.sig` do `tauri signer sign --app-version` sinh (đã gắn phiên bản, requireSignedVersion).
// Test của app (`src-tauri/src/updater/backend.rs`) cho plugin thật đọc đúng file mà script này sinh
// (`src-tauri/src/updater/testdata/latest.json`); test của script so lại với file đó.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Phiên bản semver X.Y.Z hay X.Y.Z-beta.N; trả null khi sai dạng. */
export function parseVersion(text) {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/.exec(text);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], beta: m[4] === undefined ? null : +m[4], text };
}

/** So hai phiên bản theo semver (bản beta nhỏ hơn bản stable cùng số). */
export function compareVersions(a, b) {
  for (const k of ["major", "minor", "patch"]) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (a.beta === b.beta) return 0;
  if (a.beta === null) return 1;
  if (b.beta === null) return -1;
  return a.beta < b.beta ? -1 : 1;
}

/** Tên bộ cài trên từng nền tảng, theo đúng tên mà package-macos.sh và package-windows.mjs tạo. */
export function artifactNames(product, version) {
  return {
    mac: `${product}.app.tar.gz`,
    windows: `${product}_${version}_x64-setup.exe`,
  };
}

/** `latest.json` của một bản: khóa nền tảng cả dạng có loại bộ cài lẫn dạng chung (updater thử theo thứ tự đó). */
export function releaseManifest({ version, baseUrl, names, signatures, notes, pubDate }) {
  const url = (name) => `${baseUrl.replace(/\/+$/, "")}/${version}/${encodeURIComponent(name)}`;
  const mac = { url: url(names.mac), signature: signatures.mac };
  const windows = { url: url(names.windows), signature: signatures.windows };
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      "darwin-aarch64-app": mac,
      "darwin-aarch64": mac,
      "windows-x86_64-nsis": windows,
      "windows-x86_64": windows,
    },
  };
}

/** Kênh nào nhận bản `version`, biết phiên bản hiện có của hai kênh (null khi kênh chưa có bản nào). */
export function channelsFor(version, current) {
  const v = parseVersion(version);
  if (!v) throw new Error(`phiên bản sai dạng: ${version}`);
  const newer = (channel) => current[channel] === null || compareVersions(v, parseVersion(current[channel])) > 0;
  const out = [];
  if (v.beta === null) {
    if (!newer("stable")) throw new Error(`kênh stable đã có ${current.stable}, không nhỏ hơn ${version}`);
    out.push("stable");
    if (newer("beta")) out.push("beta");
  } else {
    if (!newer("beta")) throw new Error(`kênh beta đã có ${current.beta}, không nhỏ hơn ${version}`);
    out.push("beta");
  }
  return out;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function currentVersion(path) {
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8")).version;
}

export function main(argv) {
  const version = option(argv, "--version");
  const baseUrl = option(argv, "--base-url");
  const dir = option(argv, "--dir");
  const out = option(argv, "--out");
  if (!version || !baseUrl || !dir || !out) throw new Error("cần --version, --base-url, --dir, --out");
  if (!parseVersion(version)) throw new Error(`phiên bản sai dạng: ${version}`);
  if (!baseUrl.startsWith("https://")) throw new Error("--base-url phải là https");
  const product = option(argv, "--product") ?? "AI Translator";
  const names = artifactNames(product, version);
  const signatures = {};
  for (const [platform, name] of Object.entries(names)) {
    const file = join(dir, name);
    if (!existsSync(file)) throw new Error(`thiếu ${file}`);
    if (!existsSync(`${file}.sig`)) throw new Error(`thiếu chữ ký ${file}.sig`);
    signatures[platform] = readFileSync(`${file}.sig`, "utf8").trim();
  }
  const notesFile = option(argv, "--notes-file");
  const notes = notesFile ? readFileSync(notesFile, "utf8").trim() : "";
  const pubDate = option(argv, "--pub-date") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const channels = channelsFor(version, {
    stable: currentVersion(option(argv, "--stable")),
    beta: currentVersion(option(argv, "--beta")),
  });
  const manifest = releaseManifest({ version, baseUrl, names, signatures, notes, pubDate });
  for (const channel of channels) {
    mkdirSync(join(out, channel), { recursive: true });
    writeFileSync(join(out, channel, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`${version}: ${channels.join(", ")}`);
  return channels;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
