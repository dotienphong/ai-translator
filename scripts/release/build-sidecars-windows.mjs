#!/usr/bin/env node
// Build ba tiến trình phụ của bản phát hành Windows x64 từ mã nguồn đã khóa, rồi chép vào src-tauri/binaries/ (kế hoạch
// 07a; spec §6.4, §6.11, §6.12, §10.2):
//   - asr-worker-vulkan, asr-worker-cpu: whisper.cpp 1.8.3 đã vá, link tĩnh, shared-encode; CRT tĩnh (`+crt-static`, và
//     `CMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded` cho whisper.cpp), vì cờ /DEPENDENTLOADFLAG:0x800 chỉ cho DLL import thẳng
//     nằm trong System32 (02a QĐ32; C9 của kế hoạch 00);
//   - llama-server: llama.cpp ở commit khóa trong versions.env, `GGML_BACKEND_DL` và `GGML_CPU_ALL_VARIANTS` (dòng 210),
//     Vulkan, không OpenMP (vcomp140.dll là C runtime), không web UI, không HTTPS; mọi DLL đi cùng thư mục. CRT ĐỘNG
//     (`/MD`), kèm vcruntime140.dll, vcruntime140_1.dll, msvcp140.dll… chép từ bộ Redist của Visual Studio vào cùng thư
//     mục: llama.cpp là nhiều DLL (llama, ggml-base, backend) trao đổi con trỏ `FILE*` và bộ nhớ với nhau, mà mỗi DLL link
//     CRT tĩnh có một CRT riêng, nên bản `/MT` chết ngay khi nạp model (0xc0000409, FAST_FAIL_INVALID_ARG trong llama.dll;
//     bản 0.1.1). Bản chính thức của llama.cpp cũng build `/MD`.
// Rồi kiểm bằng dumpbin: C runtime của Visual C++ chỉ được nằm cạnh file cần nó (đã đóng kèm), hai bản asr-worker không cần
// C runtime nào và không nạp DLL nào nằm cạnh nó (không có DLL ggml, C11), và in bảng SHA-256. CI còn chạy
// `smoke-llama-windows.mjs`: nạp một model nhỏ và dịch thử một câu bằng đúng các file này.
//
//   node scripts/release/build-sidecars-windows.mjs              # trên Windows, cần Vulkan SDK (install-tools.mjs vulkan-sdk)
//   node scripts/release/build-sidecars-windows.mjs --sign-only  # chỉ ký file đã có trong binaries/ rồi kiểm
//   node scripts/release/build-sidecars-windows.mjs --dry-run    # in các lệnh sẽ chạy, chạy được trên mọi máy
//
// Ký: đặt MT_WINDOWS_SIGN_CMD (xem sign-windows.mjs) thì ký từng file trước khi build app, vì build.rs băm file đã ký. CI
// build khi chưa có secret nào trong môi trường, rồi chạy `--sign-only` với secret của dịch vụ ký (spec §10.2).
// Thư mục làm việc: MT_RELEASE_WORK (mặc định target/release-work). Script xóa mọi file cũ trong src-tauri/binaries/.

import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { isVcRuntime, parseDumpbinDependents } from "./release-check.mjs";
import { readVersions, root } from "./versions.mjs";

export const TRIPLE = "x86_64-pc-windows-msvc";

/** Biến môi trường từ output của lệnh `set` của cmd.exe. */
export function parseSetOutput(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

/** Gộp biến môi trường; tên biến trên Windows không phân biệt hoa thường (`Path` và `PATH` là một), nên bỏ tên trùng ở `base`. */
export function mergeEnv(base, ...extras) {
  const out = { ...base };
  for (const extra of extras) {
    for (const [key, value] of Object.entries(extra ?? {})) {
      for (const existing of Object.keys(out)) if (existing.toLowerCase() === key.toLowerCase()) delete out[existing];
      out[key] = value;
    }
  }
  return out;
}

/**
 * Các bước build, theo thứ tự: { run: [lệnh, ...tham số], env?, cwd? } hoặc { copy: [từ, tới] } hoặc { dlls: [từ, tới] }
 * hoặc { vcRuntime: thư mục } (chép C runtime của Visual C++ mà các file trong thư mục đó cần).
 */
export function steps({ work, target, out, versions }) {
  // RUSTFLAGS thay hẳn rustflags của .cargo/config.toml, nên nhắc lại cờ DEPENDENTLOADFLAG ở đây.
  const crt = {
    RUSTFLAGS: "-C target-feature=+crt-static -C link-arg=/DEPENDENTLOADFLAG:0x800",
    CMAKE_MSVC_RUNTIME_LIBRARY: "MultiThreaded",
    CMAKE_POLICY_DEFAULT_CMP0091: "NEW",
  };
  const cargo = (features) => ({
    run: ["cargo", "build", "--release", "--locked", "-p", "asr-worker", "--features", features],
    env: crt,
    cwd: root,
  });
  const exe = join(target, "release", "asr-worker.exe");
  const src = join(work, "llama.cpp");
  const build = join(work, "llama-build");
  return [
    cargo("vulkan,shared-encode"),
    { copy: [exe, join(out, `asr-worker-vulkan-${TRIPLE}.exe`)] },
    cargo("shared-encode"),
    { copy: [exe, join(out, `asr-worker-cpu-${TRIPLE}.exe`)] },
    {
      run: [
        "cmake",
        "-S",
        src,
        "-B",
        build,
        "-G",
        "Ninja",
        "-DCMAKE_BUILD_TYPE=Release",
        "-DBUILD_SHARED_LIBS=ON",
        "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL",
        "-DGGML_NATIVE=OFF",
        "-DGGML_BACKEND_DL=ON",
        "-DGGML_CPU_ALL_VARIANTS=ON",
        "-DGGML_VULKAN=ON",
        "-DGGML_OPENMP=OFF",
        "-DGGML_RPC=OFF",
        "-DGGML_CCACHE=OFF",
        `-DLLAMA_BUILD_NUMBER=${versions.LLAMA_CPP_BUILD_NUMBER}`,
        "-DLLAMA_BUILD_TESTS=OFF",
        "-DLLAMA_BUILD_EXAMPLES=OFF",
        "-DLLAMA_BUILD_TOOLS=ON",
        "-DLLAMA_BUILD_SERVER=ON",
        "-DLLAMA_BUILD_UI=OFF",
        "-DLLAMA_USE_PREBUILT_UI=OFF",
        "-DLLAMA_OPENSSL=OFF",
      ],
    },
    // Build cả dự án: các backend (ggml-vulkan, ggml-cpu-<biến thể>) là module riêng, llama-server không link thẳng.
    { run: ["cmake", "--build", build, "--config", "Release"] },
    { copy: [join(build, "bin", "llama-server.exe"), join(out, `llama-server-${TRIPLE}.exe`)] },
    { dlls: [join(build, "bin"), out] },
    { vcRuntime: out },
  ];
}

function show(step) {
  if (step.run) {
    const env = Object.entries(step.env ?? {}).map(([k, v]) => `${k}="${v}" `).join("");
    return `${env}${step.run.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`;
  }
  if (step.copy) return `copy ${step.copy[0]} -> ${step.copy[1]}`;
  if (step.vcRuntime) return `copy C runtime của Visual C++ (Redist) mà file trong ${step.vcRuntime} cần -> ${step.vcRuntime}`;
  return `copy ${step.dlls[0]}\\*.dll -> ${step.dlls[1]}`;
}

/** Thư mục chứa C runtime của Visual C++ (bản x64, đúng bộ công cụ vừa build): `$VCToolsRedistDir/x64/Microsoft.VC*.CRT`. */
export function redistCrtDir(msvc) {
  const redist = msvc.VCToolsRedistDir ?? msvc.VCTOOLSREDISTDIR;
  if (!redist) throw new Error("vcvars64.bat không đặt VCToolsRedistDir: thiếu thành phần Redist của Visual Studio");
  const x64 = join(redist, "x64");
  const dir = readdirSync(x64).find((name) => /^Microsoft\.VC\d+\.CRT$/i.test(name));
  if (!dir) throw new Error(`không thấy Microsoft.VC*.CRT trong ${x64}`);
  return join(x64, dir);
}

/**
 * Chép C runtime của Visual C++ mà các file trong `out` cần (kể cả cái mà chính các DLL runtime đó cần) từ bộ Redist của
 * Visual Studio vào `out`. Redist của bộ công cụ dùng để build luôn mới hơn hay bằng bản mọi máy đã có; DLL cạnh file thì
 * được nạp trước DLL của System32. Thiếu DLL trong Redist là lỗi, không để máy khách tự tìm.
 */
export function bundleVcRuntime(out, msvc) {
  const crtDir = redistCrtDir(msvc);
  const available = new Map(readdirSync(crtDir).map((name) => [name.toLowerCase(), name]));
  const copied = new Set();
  const queue = readdirSync(out)
    .filter((name) => /\.(exe|dll)$/i.test(name))
    .map((name) => join(out, name));
  while (queue.length > 0) {
    const file = queue.shift();
    const text = execFileSync("dumpbin", ["/nologo", "/dependents", file], { encoding: "utf8", env: mergeEnv(process.env, msvc) });
    for (const dll of parseDumpbinDependents(text).filter(isVcRuntime)) {
      const key = dll.toLowerCase();
      if (copied.has(key)) continue;
      const name = available.get(key);
      if (!name || /d\.dll$/i.test(dll)) throw new Error(`${basename(file)} cần ${dll}, không có trong ${crtDir}`);
      copyFileSync(join(crtDir, name), join(out, name));
      copied.add(key);
      queue.push(join(out, name));
    }
  }
  console.log(`đã đóng kèm C runtime của Visual C++: ${[...copied].sort().join(", ") || "(không cần)"}`);
}

/** Môi trường của Visual Studio (vcvars64.bat), để có cl, link, dumpbin trong PATH. */
export function msvcEnv() {
  const vswhere = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe");
  const vs = execFileSync(
    vswhere,
    ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"],
    { encoding: "utf8" },
  ).trim();
  const vcvars = join(vs, "VC", "Auxiliary", "Build", "vcvars64.bat");
  return parseSetOutput(execSync(`"${vcvars}" >nul && set`, { shell: "cmd.exe", encoding: "utf8" }));
}

function cloneLlama(src, versions) {
  if (!existsSync(join(src, ".git"))) {
    execFileSync(
      "git",
      ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", versions.LLAMA_CPP_TAG, "https://github.com/ggml-org/llama.cpp.git", src],
      { stdio: "inherit" },
    );
  }
  const head = execFileSync("git", ["-C", src, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== versions.LLAMA_CPP_COMMIT) throw new Error(`llama.cpp ở commit ${head}, versions.env khóa ${versions.LLAMA_CPP_COMMIT}`);
  if (execFileSync("git", ["-C", src, "status", "--porcelain"], { encoding: "utf8" }).trim() !== "") {
    throw new Error(`mã nguồn llama.cpp ở ${src} đã bị sửa: xóa thư mục đó rồi chạy lại`);
  }
}

export function main(argv) {
  const versions = readVersions();
  const work = process.env.MT_RELEASE_WORK ?? join(root, "target", "release-work");
  const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");
  const out = join(root, "src-tauri", "binaries");
  const list = steps({ work, target, out, versions });
  if (argv.includes("--dry-run")) {
    console.log(`git clone --depth 1 --branch ${versions.LLAMA_CPP_TAG} (kiểm commit ${versions.LLAMA_CPP_COMMIT})`);
    for (const step of list) console.log(show(step));
    return;
  }
  if (process.platform !== "win32") throw new Error("chỉ chạy trên Windows (hoặc dùng --dry-run)");
  const msvc = msvcEnv();
  if (argv.includes("--sign-only")) {
    signAndCheck(out, msvc);
    return;
  }
  mkdirSync(work, { recursive: true });
  cloneLlama(join(work, "llama.cpp"), versions);
  mkdirSync(out, { recursive: true });
  for (const name of readdirSync(out)) rmSync(join(out, name), { force: true });
  for (const step of list) {
    console.log(`== ${show(step)}`);
    if (step.run) {
      const [cmd, ...args] = step.run;
      execFileSync(cmd, args, { stdio: "inherit", cwd: step.cwd, env: mergeEnv(process.env, msvc, step.env) });
    } else if (step.copy) {
      copyFileSync(step.copy[0], step.copy[1]);
    } else if (step.vcRuntime) {
      bundleVcRuntime(step.vcRuntime, msvc);
    } else {
      for (const name of readdirSync(step.dlls[0]).filter((n) => n.toLowerCase().endsWith(".dll"))) {
        copyFileSync(join(step.dlls[0], name), join(step.dlls[1], name));
      }
    }
  }
  signAndCheck(out, msvc);
}

/** Ký (khi có MT_WINDOWS_SIGN_CMD) mọi file trong binaries/ trừ C runtime của Microsoft, rồi kiểm bằng dumpbin và in bảng SHA-256. */
function signAndCheck(out, msvc) {
  const files = readdirSync(out).map((name) => join(out, name));
  if (process.env.MT_WINDOWS_SIGN_CMD) {
    // DLL của Microsoft đã có chữ ký của Microsoft: ký đè bằng chứng thư của dự án là sai.
    for (const file of files.filter((f) => !isVcRuntime(basename(f)))) execFileSync("node", [join(root, "scripts/release/sign-windows.mjs"), file], { stdio: "inherit" });
  } else {
    console.log("chưa đặt MT_WINDOWS_SIGN_CMD: không ký tiến trình phụ");
  }
  const check = join(root, "scripts/release/release-check.mjs");
  const env = mergeEnv(process.env, msvc);
  const workers = files.filter((f) => /asr-worker-(vulkan|cpu)-/.test(f));
  const rest = files.filter((f) => !workers.includes(f));
  execFileSync("node", [check, "deps-windows", "--no-local-libs", ...workers], { stdio: "inherit", env });
  execFileSync("node", [check, "deps-windows", ...rest], { stdio: "inherit", env });
  execFileSync("node", [check, "table", out, "--target", TRIPLE], { stdio: "inherit" });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
