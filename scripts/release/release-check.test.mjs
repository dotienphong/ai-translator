// Test của release-check.mjs: `node --test scripts/release/`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  bundledName,
  checkBundle,
  checkSize,
  embeddedErrors,
  macosErrors,
  main,
  parseDumpbinDependents,
  parseOtoolLibraries,
  parseOtoolMinOs,
  sidecarTable,
  windowsErrors,
} from "./release-check.mjs";

const MAC = "aarch64-apple-darwin";
const WIN = "x86_64-pc-windows-msvc";

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "release-check-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("tên sau khi đóng gói giống luật của bundled_name.rs", () => {
  assert.equal(bundledName("asr-worker-aarch64-apple-darwin", MAC), "asr-worker");
  assert.equal(bundledName("asr-worker-cpu-x86_64-pc-windows-msvc.exe", WIN), "asr-worker-cpu.exe");
  assert.equal(bundledName("libggml.0.dylib", MAC), "libggml.0.dylib");
  assert.equal(bundledName("ggml-vulkan.dll", WIN), "ggml-vulkan.dll");
  assert.equal(bundledName("-aarch64-apple-darwin", MAC), "-aarch64-apple-darwin");
  assert.equal(bundledName("asr-workeraarch64-apple-darwin", MAC), "asr-workeraarch64-apple-darwin");
  assert.equal(bundledName("asr-worker-x86_64-pc-windows-msvc.exe", MAC), "asr-worker-x86_64-pc-windows-msvc.exe");
});

test("bảng SHA-256 có tên gốc, tên sau khi đóng gói, số byte", (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "asr-worker-aarch64-apple-darwin"), "worker");
  writeFileSync(join(dir, "libggml.0.dylib"), "lib");
  assert.deepEqual(sidecarTable(dir, MAC), [
    {
      file: "asr-worker-aarch64-apple-darwin",
      bundled: "asr-worker",
      bytes: 6,
      // `printf worker | shasum -a 256`, như test sha256_matches_shasum của integrity.rs
      sha256: "87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e",
    },
    {
      file: "libggml.0.dylib",
      bundled: "libggml.0.dylib",
      bytes: 3,
      sha256: "76b5a357391276b282a516f54f48ef3c207f46d8192dc58c208d5183d38415f8",
    },
  ]);
});

test("bản đóng gói khớp binaries/ thì không lỗi", (t) => {
  const root = tempDir(t);
  const bin = join(root, "binaries");
  const app = join(root, "MacOS");
  mkdirSync(bin);
  mkdirSync(app);
  writeFileSync(join(bin, "asr-worker-aarch64-apple-darwin"), "worker");
  writeFileSync(join(bin, "llama-server-aarch64-apple-darwin"), "server");
  writeFileSync(join(app, "asr-worker"), "worker");
  writeFileSync(join(app, "llama-server"), "server");
  writeFileSync(join(app, "meeting-translator"), "app");
  assert.deepEqual(checkBundle(bin, app, MAC), []);
});

test("bản đóng gói thiếu file, file bị đổi (ví dụ ký lại), hay có thư viện lạ thì lỗi", (t) => {
  const root = tempDir(t);
  const bin = join(root, "binaries");
  const app = join(root, "MacOS");
  mkdirSync(bin);
  mkdirSync(app);
  writeFileSync(join(bin, "asr-worker-aarch64-apple-darwin"), "worker");
  writeFileSync(join(bin, "llama-server-aarch64-apple-darwin"), "server");
  writeFileSync(join(app, "asr-worker"), "worker signed again");
  writeFileSync(join(app, "libggml-cpu.dylib"), "lib");
  assert.deepEqual(checkBundle(bin, app, MAC), [
    "asr-worker khác bản trong binaries/ (asr-worker-aarch64-apple-darwin), bảng SHA-256 build sẵn sẽ không khớp",
    "thiếu llama-server trong bản đóng gói",
    "thư viện lạ trong bản đóng gói: libggml-cpu.dylib",
  ]);
});

test("binaries/ rỗng là lỗi", (t) => {
  const root = tempDir(t);
  assert.deepEqual(checkBundle(root, root, MAC), [`${root} không có file nào`]);
});

test("file chạy của app phải mang SHA-256 của mọi file, với tên sau khi đóng gói", () => {
  const table = [
    { file: "asr-worker-aarch64-apple-darwin", bundled: "asr-worker", bytes: 6, sha256: "a".repeat(64) },
    { file: "libggml.0.dylib", bundled: "libggml.0.dylib", bytes: 3, sha256: "b".repeat(64) },
  ];
  const release = Buffer.from(`xx asr-worker${"a".repeat(64)}libggml.0.dylib${"b".repeat(64)} yy`);
  assert.deepEqual(embeddedErrors(release, table), []);
  const dev = Buffer.from(`asr-worker-aarch64-apple-darwin${"a".repeat(64)}`);
  assert.deepEqual(embeddedErrors(dev, table), [
    "file chạy của app còn tên bản dev asr-worker-aarch64-apple-darwin: bảng SHA-256 không dùng tên sau khi đóng gói",
    "file chạy của app không có SHA-256 của libggml.0.dylib",
  ]);
});

const OTOOL_L = `build/bin/llama-server:
\t/System/Library/Frameworks/Accelerate.framework/Versions/A/Accelerate (compatibility version 1.0.0, current version 4.0.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1359.0.0)
\t@rpath/libggml.0.dylib (compatibility version 0.0.0, current version 0.10.0)
`;

const OTOOL_LOAD = `Load command 9
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform 1
    minos 14.2
      sdk 26.4
   ntools 1
`;

test("đọc otool -L và otool -l", () => {
  assert.deepEqual(parseOtoolLibraries(OTOOL_L), [
    "/System/Library/Frameworks/Accelerate.framework/Versions/A/Accelerate",
    "/usr/lib/libSystem.B.dylib",
    "@rpath/libggml.0.dylib",
  ]);
  assert.equal(parseOtoolMinOs(OTOOL_LOAD), "14.2");
  assert.equal(parseOtoolMinOs("cmd LC_SEGMENT_64"), null);
});

test("macOS: thư viện ngoài hệ thống và minos cao hơn đều là lỗi", () => {
  assert.deepEqual(macosErrors("llama-server", parseOtoolLibraries(OTOOL_L), "14.2", "14.2"), [
    "llama-server nạp thư viện ngoài hệ thống: @rpath/libggml.0.dylib",
  ]);
  assert.deepEqual(macosErrors("asr-worker", ["/usr/lib/libc++.1.dylib"], "15.0", "14.2"), [
    "asr-worker cần macOS 15.0, cao hơn 14.2",
  ]);
  assert.deepEqual(macosErrors("asr-worker", ["/usr/lib/libc++.1.dylib"], "13.3", "14.2"), []);
  assert.deepEqual(macosErrors("asr-worker", [], null, "14.2"), ["asr-worker không có LC_BUILD_VERSION"]);
});

const DUMPBIN = `
Dump of file asr-worker-vulkan.exe

File Type: EXECUTABLE IMAGE

  Image has the following dependencies:

    vulkan-1.dll
    KERNEL32.dll
    VCRUNTIME140.dll
    api-ms-win-crt-runtime-l1-1-0.dll

  Image has the following delay load dependencies:

    ggml-base.dll

  Summary

        1000 .data
`;

test("đọc dumpbin /dependents, kể cả phần delay load", () => {
  assert.deepEqual(parseDumpbinDependents(DUMPBIN), [
    "vulkan-1.dll",
    "KERNEL32.dll",
    "VCRUNTIME140.dll",
    "api-ms-win-crt-runtime-l1-1-0.dll",
    "ggml-base.dll",
  ]);
  assert.deepEqual(parseDumpbinDependents("File Type: EXECUTABLE IMAGE"), []);
});

test("Windows: C runtime của Visual C++ luôn là lỗi; DLL cạnh file là lỗi khi --no-local-libs", () => {
  const dlls = parseDumpbinDependents(DUMPBIN);
  assert.deepEqual(windowsErrors("asr-worker-vulkan.exe", dlls, ["ggml-base.dll", "llama.dll"], true), [
    "asr-worker-vulkan.exe cần C runtime của Visual C++: VCRUNTIME140.dll",
    "asr-worker-vulkan.exe nạp DLL nằm cạnh nó: ggml-base.dll",
  ]);
  assert.deepEqual(windowsErrors("llama-server.exe", ["ggml.dll", "KERNEL32.dll", "MSVCP140.dll"], ["ggml.dll"], false), [
    "llama-server.exe cần C runtime của Visual C++: MSVCP140.dll",
  ]);
  assert.deepEqual(windowsErrors("llama-server.exe", ["ggml.dll", "vcomp140.dll"], [], false), [
    "llama-server.exe cần C runtime của Visual C++: vcomp140.dll",
  ]);
  assert.deepEqual(windowsErrors("x.exe", ["KERNEL32.dll", "api-ms-win-crt-heap-l1-1-0.dll"], [], true), []);
});

test("ngưỡng dung lượng tính bằng byte, bằng ngưỡng vẫn đạt", () => {
  assert.deepEqual(checkSize(60_000_000, 60_000_000), []);
  assert.deepEqual(checkSize(60_000_001, 60_000_000), ["60000001 byte, vượt ngưỡng 60000000 byte"]);
});

test("CLI: size và sha256sums", (t) => {
  const dir = tempDir(t);
  const file = join(dir, "AI Translator_0.1.0_aarch64.dmg");
  writeFileSync(file, "worker");
  assert.deepEqual(main(["size", file, "--max-bytes", "6"]), []);
  assert.deepEqual(main(["size", file, "--max-bytes", "5"]), ["6 byte, vượt ngưỡng 5 byte"]);
  const out = join(dir, "SHA256SUMS");
  assert.deepEqual(main(["sha256sums", file, "--out", out]), []);
  assert.equal(
    readFileSync(out, "utf8"),
    "87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e  AI Translator_0.1.0_aarch64.dmg\n",
  );
  assert.throws(() => main(["size", file]), /thiếu --max-bytes/);
  assert.throws(() => main(["nope"]), /lệnh không rõ: nope/);
});
