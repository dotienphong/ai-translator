#!/usr/bin/env node
// Kiểm một bản phát hành có đủ cấu hình production trước khi đăng (kế hoạch 07b; spec §6.7, §6.8, §6.11, §10.2).
//
//   node scripts/release/release-ready.mjs --tag <vX.Y.Z[-beta.N]>   chỉ kiểm tag khớp version trong tauri.conf.json
//   node scripts/release/release-ready.mjs [--base-url <URL gốc>]    kiểm đủ (job `publish` của release.yml)
//
// Bản phát hành chỉ dùng giá trị production: thiếu một trong các giá trị dưới đây thì app vẫn chạy, nhưng tắt tự cập
// nhật, không tải được model, hay chỉ có gói Free. Vì vậy không đăng bản nào khi còn thiếu. `--base-url` (biến
// RELEASES_BASE_URL của repo) phải đúng URL gốc build sẵn trong app, không thì app hỏi nhầm chỗ.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { parseVersion } from "./update-manifest.mjs";
import { root as repoRoot } from "./versions.mjs";

/** Giá trị của `pub const PRODUCTION_URL: Option<&str> = Some("…");` trong một file Rust; `null` khi là `None`. */
export function rustProductionUrl(text) {
  const m = /^pub const PRODUCTION_URL: Option<&str> = (None|Some\("([^"]*)"\));/m.exec(text);
  if (!m) throw new Error("không thấy dòng `pub const PRODUCTION_URL`");
  return m[2] ?? null;
}

/** Khóa công khai của `tauri signer generate`: base64 của `untrusted comment: …` và khóa minisign Ed25519 (42 byte). */
export function isUpdaterKey(text) {
  if (typeof text !== "string" || text.trim() === "") return false;
  const lines = Buffer.from(text.trim(), "base64").toString("utf8").split("\n").filter((l) => l.trim() !== "");
  if (lines.length !== 2 || !lines[0].startsWith("untrusted comment:")) return false;
  const raw = Buffer.from(lines[1].trim(), "base64");
  return raw.length === 42 && raw.subarray(0, 2).toString() === "Ed";
}

const isJwk = (k) => typeof k?.kid === "string" && k.kid !== "" && typeof k?.x === "string" && k.x !== "" && !("d" in k);

/** Tag phải là `v<version>` với version đúng như trong tauri.conf.json (bản beta cũng vậy: app so phiên bản của nó). */
export function tagErrors(tag, confVersion) {
  if (!parseVersion(confVersion)) return [`tauri.conf.json có version ${confVersion}: chỉ nhận X.Y.Z hay X.Y.Z-beta.N`];
  return tag === `v${confVersion}` ? [] : [`tag ${tag} không khớp version ${confVersion} trong tauri.conf.json`];
}

/** Các giá trị production còn thiếu; rỗng là đủ. */
export function readinessErrors(root, { baseUrl } = {}) {
  const errors = [];
  const read = (path) => readFileSync(join(root, path), "utf8");
  const https = (url) => typeof url === "string" && url.startsWith("https://");
  const url = (path, what) => {
    const value = rustProductionUrl(read(path));
    if (!https(value)) errors.push(`${path}: PRODUCTION_URL chưa có (${what})`);
    return value;
  };
  const updaterKeys = JSON.parse(read("src-tauri/keys/updater-public-keys.json"));
  if (!isUpdaterKey(updaterKeys.production)) {
    errors.push("src-tauri/keys/updater-public-keys.json: chưa có khóa production (Task 11 của 07b)");
  }
  const updaterUrl = url("src-tauri/src/updater/source.rs", "URL gốc bản cập nhật, Task 12 của 07b");
  if (baseUrl !== undefined && https(updaterUrl) && updaterUrl.replace(/\/+$/, "") !== baseUrl.replace(/\/+$/, "")) {
    errors.push(`RELEASES_BASE_URL ${baseUrl} khác URL gốc build sẵn trong app ${updaterUrl}`);
  }
  url("src-tauri/src/models/source.rs", "manifest model, Task 12 của 07b");
  const manifestKeys = JSON.parse(read("src-tauri/keys/manifest-public-keys.json")).production;
  if (!Array.isArray(manifestKeys) || manifestKeys.length === 0 || !manifestKeys.every(isJwk)) {
    errors.push("src-tauri/keys/manifest-public-keys.json: chưa có khóa production (Task 11 của 07b)");
  }
  url("src-tauri/src/license/client.rs", "license server, kế hoạch 05 Task 21");
  const licenseKeys = JSON.parse(read("src-tauri/keys/license-public-keys.json")).production ?? {};
  if (!isJwk(licenseKeys.a) || !isJwk(licenseKeys.b)) {
    errors.push("src-tauri/keys/license-public-keys.json: production chưa đủ hai ô a, b (kế hoạch 05 Task 21)");
  }
  const hosts = /pub const EXTERNAL_HOSTS: &\[&str\] = &\[([\s\S]*?)\];/.exec(read("src-tauri/src/navigation.rs"));
  const names = [...(hosts?.[1] ?? "").matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]);
  if (!names.some((h) => h !== "pay.payos.vn")) {
    errors.push("src-tauri/src/navigation.rs: EXTERNAL_HOSTS chưa có tên miền website (T7, Task 12 của 07b)");
  }
  return errors;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function main(argv, root = repoRoot) {
  const tag = option(argv, "--tag");
  const errors = tag
    ? tagErrors(tag, JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version)
    : readinessErrors(root, { baseUrl: option(argv, "--base-url") });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(tag ? `tag ${tag} khớp tauri.conf.json` : "đủ cấu hình production");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`LỖI: ${error.message.split("\n").join("\nLỖI: ")}`);
    process.exitCode = 1;
  }
}
