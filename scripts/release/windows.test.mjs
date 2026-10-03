// Test phần thuần của các script Windows (chạy được trên Mac): `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { TRIPLE, mergeEnv, parseSetOutput, steps } from "./build-sidecars-windows.mjs";
import { findInstaller, signConfig, tauriArgs } from "./package-windows.mjs";
import { signCommandLine } from "./sign-windows.mjs";
import { readVersions } from "./versions.mjs";

const versions = readVersions();

test("build Windows: CRT tĩnh, giữ cờ DEPENDENTLOADFLAG, đủ cờ llama.cpp đã chốt", () => {
  const list = steps({ work: "W", target: "T", out: "O", versions });
  const cargo = list.filter((s) => s.run?.[0] === "cargo");
  assert.deepEqual(
    cargo.map((s) => s.run.at(-1)),
    ["vulkan,shared-encode", "shared-encode"],
  );
  for (const s of cargo) {
    assert.equal(s.env.RUSTFLAGS, "-C target-feature=+crt-static -C link-arg=/DEPENDENTLOADFLAG:0x800");
    assert.equal(s.env.CMAKE_MSVC_RUNTIME_LIBRARY, "MultiThreaded");
  }
  assert.deepEqual(
    list.filter((s) => s.copy).map((s) => s.copy[1]),
    [
      join("O", `asr-worker-vulkan-${TRIPLE}.exe`),
      join("O", `asr-worker-cpu-${TRIPLE}.exe`),
      join("O", `llama-server-${TRIPLE}.exe`),
    ],
  );
  const configure = list.find((s) => s.run?.[0] === "cmake" && s.run[1] === "-S").run;
  for (const flag of [
    "-DBUILD_SHARED_LIBS=ON",
    "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded",
    "-DGGML_NATIVE=OFF",
    "-DGGML_BACKEND_DL=ON",
    "-DGGML_CPU_ALL_VARIANTS=ON",
    "-DGGML_VULKAN=ON",
    "-DGGML_OPENMP=OFF",
    "-DLLAMA_BUILD_UI=OFF",
    "-DLLAMA_USE_PREBUILT_UI=OFF",
    "-DLLAMA_OPENSSL=OFF",
    `-DLLAMA_BUILD_NUMBER=${versions.LLAMA_CPP_BUILD_NUMBER}`,
  ]) {
    assert.ok(configure.includes(flag), flag);
  }
  assert.deepEqual(list.at(-1), { dlls: [join("W", "llama-build", "bin"), "O"] });
});

test("môi trường của vcvars: đọc `set`, gộp không trùng tên khác hoa thường", () => {
  const msvc = parseSetOutput("Path=C:\\VS\\bin;C:\\Windows\r\nINCLUDE=C:\\VS\\include\r\nx=a=b\r\n");
  assert.deepEqual(msvc, { Path: "C:\\VS\\bin;C:\\Windows", INCLUDE: "C:\\VS\\include", x: "a=b" });
  assert.deepEqual(mergeEnv({ PATH: "old", HOME: "h" }, msvc, { RUSTFLAGS: "r" }), {
    HOME: "h",
    Path: "C:\\VS\\bin;C:\\Windows",
    INCLUDE: "C:\\VS\\include",
    x: "a=b",
    RUSTFLAGS: "r",
  });
});

test("lệnh ký: thay {file} bằng đường dẫn trong nháy; thiếu cấu hình hay ký tự lạ (%, nháy, &) thì lỗi", () => {
  assert.equal(
    signCommandLine("smctl sign --input {file}", "C:\\a b\\x.exe"),
    'smctl sign --input "C:\\a b\\x.exe"',
  );
  assert.throws(() => signCommandLine(undefined, "x.exe"), /chưa đặt MT_WINDOWS_SIGN_CMD/);
  assert.throws(() => signCommandLine("signtool sign", "x.exe"), /phải có \{file\}/);
  for (const bad of ['a".exe', "%MT_SIGN_SECRET%.dll", "C:\\b\\x&y.exe", "x^.dll", "a!b.dll", "C:\\%TEMP%\\x.exe", "a\nb.exe"]) {
    assert.throws(() => signCommandLine("s {file}", bad), /ký tự không cho phép/, bad);
  }
  assert.equal(
    signCommandLine("s {file}", "D:\\a\\r\\target\\release\\bundle\\nsis\\AI Translator_0.1.0_x64-setup.exe"),
    's "D:\\a\\r\\target\\release\\bundle\\nsis\\AI Translator_0.1.0_x64-setup.exe"',
  );
  assert.match(signCommandLine("s {file}", "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\uninstall.exe"), /RUNNER~1/);
});

test("đóng gói Windows: build không mang cấu hình ký, bundle mới mang; tên bộ cài", () => {
  assert.deepEqual(tauriArgs("build", "W/sign.json"), [
    "tauri",
    "build",
    "--ci",
    "--no-bundle",
    "--config",
    "src-tauri/release/tauri.windows.json",
    "--",
    "--locked",
  ]);
  assert.deepEqual(tauriArgs("bundle", null), [
    "tauri",
    "bundle",
    "--ci",
    "--bundles",
    "nsis",
    "--config",
    "src-tauri/release/tauri.windows.json",
  ]);
  assert.deepEqual(tauriArgs("bundle", "W/sign.json").slice(-2), ["--config", "W/sign.json"]);
  assert.deepEqual(signConfig("C:\\r\\sign-windows.mjs"), {
    bundle: { windows: { signCommand: { cmd: "node", args: ["C:\\r\\sign-windows.mjs", "%1"] } } },
  });
  assert.equal(
    findInstaller(["AI Translator_0.1.0_x64-setup.exe", "x.txt"], "AI Translator", "0.1.0"),
    "AI Translator_0.1.0_x64-setup.exe",
  );
  assert.throws(() => findInstaller([], "AI Translator", "0.1.0"), /không thấy AI Translator_0.1.0_x64-setup.exe/);
});
