// Test phần thuần của các script Windows (chạy được trên Mac): `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { TRIPLE, mergeEnv, parseSetOutput, redistCrtDir, steps } from "./build-sidecars-windows.mjs";
import { findInstaller, signConfig, tauriArgs } from "./package-windows.mjs";
import { describeExit, findServer, serverArgs, sha256 } from "./smoke-llama-windows.mjs";
import { signCommandLine } from "./sign-windows.mjs";
import { readVersions } from "./versions.mjs";

const versions = readVersions();

test("build Windows: asr-worker CRT tĩnh + DEPENDENTLOADFLAG; llama.cpp CRT động kèm runtime; đủ cờ llama.cpp đã chốt", () => {
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
    "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL",
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
  // Nhiều DLL của llama.cpp trao đổi FILE* và bộ nhớ: mỗi DLL một CRT tĩnh thì chết khi nạp model (bản 0.1.1), nên CRT động
  // và đóng kèm runtime của Visual C++ ngay sau khi chép DLL.
  assert.ok(!configure.includes("-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded"));
  assert.deepEqual(list.slice(-2), [{ dlls: [join("W", "llama-build", "bin"), "O"] }, { vcRuntime: "O" }]);
});

test("Redist của Visual Studio: thư mục Microsoft.VC*.CRT dưới VCToolsRedistDir/x64", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "redist-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "x64", "Microsoft.VC145.CRT"), { recursive: true });
  mkdirSync(join(dir, "x64", "Microsoft.VC145.DebugCRT"), { recursive: true });
  assert.equal(redistCrtDir({ VCToolsRedistDir: dir }), join(dir, "x64", "Microsoft.VC145.CRT"));
  assert.throws(() => redistCrtDir({}), /VCToolsRedistDir/);
  assert.throws(() => redistCrtDir({ VCToolsRedistDir: join(dir, "x64") }), /ENOENT|không thấy/);
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

test("kiểm llama-server: tìm file chạy, tham số giống app, mã thoát đọc được, SHA-256 model thử khóa trong versions.env", () => {
  const present = (names) => (path) => names.some((n) => path.endsWith(n));
  assert.equal(findServer("B", present([`llama-server-${TRIPLE}.exe`])), join("B", `llama-server-${TRIPLE}.exe`));
  assert.equal(findServer("I", present(["llama-server.exe"])), join("I", "llama-server.exe"));
  assert.throws(() => findServer("X", present([])), /không thấy llama-server trong X/);
  assert.deepEqual(serverArgs("m.gguf", 5, "auto"), [
    "-m", "m.gguf", "--host", "127.0.0.1", "--port", "5", "-c", "512", "-np", "1", "-ngl", "auto", "--no-ui",
  ]);
  // Windows trả mã thoát có dấu: 0xc0000409 là -1073740791.
  assert.equal(describeExit(-1073740791, null), "mã thoát 0xc0000409");
  assert.equal(describeExit(0, null), "mã thoát 0x0");
  assert.equal(describeExit(null, "SIGKILL"), "bị tín hiệu SIGKILL");
  assert.equal(sha256(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.match(versions.SMOKE_MODEL_URL, /^https:\/\/huggingface\.co\/ggml-org\/models\/resolve\/[0-9a-f]{40}\/.+\.gguf$/);
  assert.match(versions.SMOKE_MODEL_SHA256, /^[0-9a-f]{64}$/);
});
