// Test của versions.mjs và install-tools.mjs (chạy được trên Mac): `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { shaErrors, tarExecutable, toolAsset } from "./install-tools.mjs";
import { parseVersions, readVersions } from "./versions.mjs";

const versions = readVersions();

test("versions.env: mọi khóa cần có, commit llama.cpp đủ 40 ký tự", () => {
  for (const key of ["LLAMA_CPP_TAG", "LLAMA_CPP_COMMIT", "LLAMA_CPP_BUILD_NUMBER", "PROTOC_VERSION", "VULKAN_SDK_VERSION"]) {
    assert.ok(versions[key], key);
  }
  assert.match(versions.LLAMA_CPP_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(`b${versions.LLAMA_CPP_BUILD_NUMBER}`, versions.LLAMA_CPP_TAG);
  assert.match(versions.PROTOC_SHA256_OSX_AARCH64, /^[0-9a-f]{64}$/);
  assert.match(versions.PROTOC_SHA256_WIN64, /^[0-9a-f]{64}$/);
  assert.deepEqual(parseVersions("# x\nA=1\r\nB=\n"), { A: "1", B: "" });
});

test("protoc và Vulkan SDK: đúng URL theo nền tảng; nền tảng khác thì báo lỗi", () => {
  assert.deepEqual(toolAsset("protoc", "darwin", "arm64", versions), {
    url: `https://github.com/protocolbuffers/protobuf/releases/download/v${versions.PROTOC_VERSION}/protoc-${versions.PROTOC_VERSION}-osx-aarch_64.zip`,
    file: `protoc-${versions.PROTOC_VERSION}-osx-aarch_64.zip`,
    sha256: versions.PROTOC_SHA256_OSX_AARCH64,
  });
  assert.equal(toolAsset("protoc", "win32", "x64", versions).sha256, versions.PROTOC_SHA256_WIN64);
  assert.equal(
    toolAsset("vulkan-sdk", "win32", "x64", versions).url,
    `https://sdk.lunarg.com/sdk/download/${versions.VULKAN_SDK_VERSION}/windows/vulkansdk-windows-X64-${versions.VULKAN_SDK_VERSION}.exe`,
  );
  assert.throws(() => toolAsset("protoc", "linux", "x64", versions), /chưa khóa bản cho linux-x64/);
  assert.throws(() => toolAsset("vulkan-sdk", "darwin", "arm64", versions), /chỉ cần trên Windows/);
});

test("giải nén zip: Windows dùng tar.exe của hệ thống, không dùng tar của Git Bash trong PATH", () => {
  // `tar` của Git Bash là GNU tar: đọc `D:\a\...` là "máy D, đường dẫn a\..." ("Cannot connect to D: resolve failed").
  assert.equal(tarExecutable("darwin", {}), "tar");
  assert.equal(tarExecutable("win32", { SystemRoot: "D:\\Windows" }), "D:\\Windows\\System32\\tar.exe");
  assert.equal(tarExecutable("win32", {}), "C:\\Windows\\System32\\tar.exe");
});

test("SHA-256 sai hay chưa khóa đều dừng", () => {
  assert.deepEqual(shaErrors("a.zip", "ab", "ab"), []);
  assert.deepEqual(shaErrors("a.zip", "ab", "cd"), ["a.zip: SHA-256 ab, versions.env khóa cd"]);
  assert.deepEqual(shaErrors("a.exe", "ab", ""), ["a.exe: versions.env chưa có SHA-256; SHA-256 của file vừa tải là ab"]);
});
