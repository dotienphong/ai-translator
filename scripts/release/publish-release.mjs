#!/usr/bin/env node
// Đăng một bản phát hành lên R2, CDN của bản cập nhật (spec §6.11; kế hoạch 07b). Chạy ở job `publish` của release.yml,
// sau khi các job build và ký xong, người duyệt environment `release`, và release-ready.mjs báo đủ cấu hình production.
//
//   node scripts/release/publish-release.mjs --tag <vX.Y.Z[-beta.N]> --dir <artifact `release` đã tải về> \
//     --bucket <tên bucket R2> --base-url <https://…> [--notes-file <file>] [--dry-run]
//
// Thứ tự: kiểm tag khớp version trong tauri.conf.json; đọc `latest.json` hiện có của hai kênh qua URL công khai; từ chối
// nếu một kênh đã báo bản này (đã phát hành thì không bao giờ ghi đè); tải mọi file của bản lên `<version>/`; sinh
// `latest.json` (update-manifest.mjs) rồi mới tải lên `<kênh>/latest.json`, để app không bao giờ thấy manifest trỏ tới file
// chưa có. Sau cùng ghi dấu bền `<version>/published.json`. Bản coi là đã đăng khi có dấu đó hay `latest.json` của một kênh
// đã báo nó: kể cả sau khi bản bị rút (`latest.json` về bản trước, dấu vẫn còn), chạy lại job cũng không đăng lại hay ghi
// đè file của nó (Q-A của review 07b lần 2). Lần chạy trước đứt trước khi ghi `latest.json` thì chưa có dấu: chạy lại job,
// các file của bản được tải lại. Lệnh tải là wrangler của `server/` (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID từ secret của environment).
// `--dry-run` không gọi mạng, chỉ in các lệnh (coi như hai kênh chưa có bản nào).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { tagErrors } from "./release-ready.mjs";
import { channelsFor, main as writeManifests } from "./update-manifest.mjs";
import { root } from "./versions.mjs";

const TYPES = {
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".sig": "text/plain; charset=utf-8",
  ".gz": "application/gzip",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".dmg": "application/x-apple-diskimage",
};

export function contentType(name) {
  const ext = Object.keys(TYPES).find((e) => name.endsWith(e));
  return ext ? TYPES[ext] : "application/octet-stream";
}

/** Các lần tải lên, theo thứ tự: file của bản trước, manifest của kênh sau cùng. */
export function uploadPlan({ bucket, version, files, channels }) {
  const steps = files.map((name) => ({ key: `${bucket}/${version}/${name}`, file: name, type: contentType(name) }));
  for (const channel of channels) {
    steps.push({ key: `${bucket}/${channel}/latest.json`, file: posix.join("manifests", channel, "latest.json"), type: "application/json" });
  }
  steps.push({ key: `${bucket}/${version}/published.json`, file: posix.join("manifests", "published.json"), type: "application/json" });
  return steps;
}

/** Bản đã có dấu `<version>/published.json` trên CDN chưa. */
async function hasMarker(fetch, baseUrl, version) {
  const res = await fetch(`${trim(baseUrl)}/${version}/published.json`, {
    headers: { "User-Agent": "ai-translator-release", "Cache-Control": "no-cache" },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`${version}/published.json: HTTP ${res.status}`);
  return true;
}

const trim = (url) => url.replace(/\/+$/, "");

async function currentVersion(fetch, baseUrl, channel) {
  const res = await fetch(`${trim(baseUrl)}/${channel}/latest.json`, {
    headers: { "User-Agent": "ai-translator-release", "Cache-Control": "no-cache" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${channel}/latest.json: HTTP ${res.status}`);
  return (await res.json()).version;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function wrangler(cmd, repo) {
  execFileSync("pnpm", cmd, { cwd: repo, stdio: "inherit", shell: process.platform === "win32" });
}

/** `fetch` và `run` (chạy một lệnh `pnpm`) thay được, để test nhánh có mạng. */
export async function main(argv, { repo = root, fetch = globalThis.fetch, run = wrangler } = {}) {
  const tag = option(argv, "--tag");
  const dir = option(argv, "--dir");
  const bucket = option(argv, "--bucket");
  const baseUrl = option(argv, "--base-url");
  const dryRun = argv.includes("--dry-run");
  if (!tag || !dir || !bucket || !baseUrl) throw new Error("cần --tag, --dir, --bucket, --base-url");
  if (!baseUrl.startsWith("https://")) throw new Error("--base-url phải là https");
  const conf = JSON.parse(readFileSync(join(repo, "src-tauri/tauri.conf.json"), "utf8"));
  const errors = tagErrors(tag, conf.version);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const version = conf.version;

  if (!dryRun && (await hasMarker(fetch, baseUrl, version))) {
    throw new Error(`${version} đã được đăng (có ${version}/published.json); không đăng lại hay ghi đè một bản đã phát hành`);
  }
  const current = {
    stable: dryRun ? null : await currentVersion(fetch, baseUrl, "stable"),
    beta: dryRun ? null : await currentVersion(fetch, baseUrl, "beta"),
  };
  if (current.stable === version || current.beta === version) {
    throw new Error(`${version} đã được đăng (latest.json của kênh đã báo bản này); không ghi đè một bản đã phát hành`);
  }
  const channels = channelsFor(version, current);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
  const args = ["--version", version, "--product", conf.productName, "--base-url", baseUrl, "--dir", dir];
  args.push("--out", join(dir, "manifests"));
  const notes = option(argv, "--notes-file");
  if (notes) args.push("--notes-file", notes);
  mkdirSync(join(dir, "manifests"), { recursive: true });
  for (const channel of ["stable", "beta"]) {
    if (current[channel] !== null) {
      const path = join(dir, "manifests", `current-${channel}.json`);
      writeFileSync(path, JSON.stringify({ version: current[channel] }));
      args.push(`--${channel}`, path);
    }
  }
  writeManifests(args);
  writeFileSync(join(dir, "manifests", "published.json"), `${JSON.stringify({ version, tag, channels })}\n`);

  for (const step of uploadPlan({ bucket, version, files, channels })) {
    // `pnpm -C server exec` chạy wrangler ở server/, nên --file phải tuyệt đối (dir có thể là `target/release-out`).
    const cmd = ["-C", "server", "exec", "wrangler", "r2", "object", "put", step.key, "--file", resolve(dir, step.file)];
    cmd.push("--content-type", step.type, "--remote");
    if (step.key.endsWith(".json") && step.file.startsWith("manifests")) cmd.push("--cache-control", "no-cache");
    console.log(`${dryRun ? "(dry-run) " : ""}pnpm ${cmd.join(" ")}`);
    if (!dryRun) run(cmd, repo);
  }
  return { version, channels };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    ({ version, channels }) => console.log(`đã đăng ${version} lên kênh ${channels.join(", ")}`),
    (error) => {
      console.error(`LỖI: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
