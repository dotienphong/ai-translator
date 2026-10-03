#!/usr/bin/env node
// Cài công cụ build cho CI từ bản đã khóa trong versions.env, có kiểm SHA-256 (kế hoạch 07a; spec §6.12, §10.2).
//
//   node scripts/release/install-tools.mjs protoc --dest <thư mục>      # macOS arm64 hoặc Windows x64
//   node scripts/release/install-tools.mjs vulkan-sdk                   # Windows x64, cài vào C:\VulkanSDK\<phiên bản>
//
// Trong GitHub Actions (có GITHUB_PATH, GITHUB_ENV), thư mục bin được thêm vào PATH của các bước sau, và Vulkan SDK đặt
// biến VULKAN_SDK. Vulkan SDK chưa có SHA-256 trong versions.env thì in SHA-256 của file vừa tải rồi dừng: người chốt so
// với trang tải của LunarG rồi ghi vào versions.env (Task 14 của kế hoạch 07a).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { readVersions } from "./versions.mjs";

/** File cần tải của một công cụ trên một nền tảng: { url, file, sha256 } (sha256 có thể rỗng). */
export function toolAsset(tool, platform, arch, versions) {
  if (tool === "protoc") {
    const v = versions.PROTOC_VERSION;
    const [name, key] =
      platform === "darwin" && arch === "arm64"
        ? ["osx-aarch_64", "PROTOC_SHA256_OSX_AARCH64"]
        : platform === "win32" && arch === "x64"
          ? ["win64", "PROTOC_SHA256_WIN64"]
          : [null, null];
    if (!name) throw new Error(`protoc: chưa khóa bản cho ${platform}-${arch}`);
    const file = `protoc-${v}-${name}.zip`;
    return {
      url: `https://github.com/protocolbuffers/protobuf/releases/download/v${v}/${file}`,
      file,
      sha256: versions[key],
    };
  }
  if (tool === "vulkan-sdk") {
    if (platform !== "win32" || arch !== "x64") throw new Error("vulkan-sdk: chỉ cần trên Windows x64");
    const v = versions.VULKAN_SDK_VERSION;
    const file = `vulkansdk-windows-X64-${v}.exe`;
    return { url: `https://sdk.lunarg.com/sdk/download/${v}/windows/${file}`, file, sha256: versions.VULKAN_SDK_SHA256 };
  }
  throw new Error(`công cụ không rõ: ${tool}`);
}

/** Lỗi khi SHA-256 của file tải về không khớp bản đã khóa (hoặc chưa khóa). */
export function shaErrors(file, actual, expected) {
  if (!expected) return [`${file}: versions.env chưa có SHA-256; SHA-256 của file vừa tải là ${actual}`];
  if (actual !== expected) return [`${file}: SHA-256 ${actual}, versions.env khóa ${expected}`];
  return [];
}

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": "release-tools" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function exportPath(dir) {
  if (process.env.GITHUB_PATH) appendFileSync(process.env.GITHUB_PATH, `${dir}\n`);
}

function exportEnv(name, value) {
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}

export async function main(argv, { platform = process.platform, arch = process.arch } = {}) {
  const [tool, ...rest] = argv;
  const versions = readVersions();
  const asset = toolAsset(tool, platform, arch, versions);
  const bytes = await download(asset.url);
  const actual = createHash("sha256").update(bytes).digest("hex");
  const errors = shaErrors(asset.file, actual, asset.sha256);
  if (errors.length > 0) return errors;
  if (tool === "protoc") {
    const i = rest.indexOf("--dest");
    if (i < 0 || !rest[i + 1]) throw new Error("protoc: thiếu --dest <thư mục>");
    const dest = rest[i + 1];
    mkdirSync(dest, { recursive: true });
    const zip = join(dest, asset.file);
    writeFileSync(zip, bytes);
    // `tar` của macOS và Windows 10+ (bsdtar) đọc được zip.
    execFileSync("tar", ["-xf", zip, "-C", dest], { stdio: "inherit" });
    const bin = join(dest, "bin");
    exportPath(bin);
    console.log(`protoc ${versions.PROTOC_VERSION}: ${bin}`);
  } else {
    const installer = join(process.env.RUNNER_TEMP ?? ".", asset.file);
    writeFileSync(installer, bytes);
    execFileSync(installer, ["--accept-licenses", "--default-answer", "--confirm-command", "install"], { stdio: "inherit" });
    const sdk = `C:\\VulkanSDK\\${versions.VULKAN_SDK_VERSION}`;
    exportEnv("VULKAN_SDK", sdk);
    exportPath(`${sdk}\\Bin`);
    console.log(`Vulkan SDK ${versions.VULKAN_SDK_VERSION}: ${sdk}`);
  }
  return [];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (errors) => {
      for (const error of errors) console.error(`LỖI: ${error}`);
      process.exitCode = errors.length === 0 ? 0 : 1;
    },
    (error) => {
      console.error(`LỖI: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
