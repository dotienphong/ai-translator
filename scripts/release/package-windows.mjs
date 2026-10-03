#!/usr/bin/env node
// Đóng gói bản phát hành Windows x64: bộ cài NSIS `.exe` kèm bootstrapper WebView2 (kế hoạch 07a; spec §6.11, §10.2, A6).
// Chạy sau build-sidecars-windows.mjs và notices.mjs.
//
//   node scripts/release/package-windows.mjs          # cả hai phần dưới đây
//   node scripts/release/package-windows.mjs build    # bước 1–2: biên dịch app, không cần secret nào
//   node scripts/release/package-windows.mjs bundle   # bước 3–5: đóng gói, ký, kiểm
//
// Các bước:
//   1. Ghi lại SHA-256 của src-tauri/binaries/ (build.rs băm đúng các file này vào app).
//   2. `tauri build --no-bundle` với src-tauri/release/tauri.windows.json; binaries/ không được đổi, và file chạy của app
//      mang bảng SHA-256 của chúng với tên sau khi đóng gói.
//   3. `tauri bundle --bundles nsis` (không biên dịch lại). Có MT_WINDOWS_SIGN_CMD thì thêm `bundle.windows.signCommand`
//      (sign-windows.mjs): Tauri ký file chạy của app, bộ cài, bộ gỡ, và bỏ qua tiến trình phụ, DLL đã ký sẵn (Tauri chỉ
//      ký file chưa có chữ ký hợp lệ, nên tiến trình phụ phải ký trước, ở build-sidecars-windows.mjs).
//   4. binaries/ vẫn không đổi; giải nén bộ cài bằng 7-Zip rồi kiểm tiến trình phụ, DLL đúng từng byte.
//   5. Kiểm dung lượng ≤ 60 000 000 byte (§6.11, C10), ghi SHA-256. Chữ ký bản cập nhật (`.sig`) ký ở job riêng
//      (sign-updates.mjs).
//
// CI chạy `build` và `bundle` ở hai job khác nhau, trên hai runner khác nhau: job `build` không có secret nào, job
// `bundle` (environment `release`) không biên dịch gì (spec §10.2, rủi ro chuỗi cung ứng; Q1 của review 07a lần 1).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { checkBundle, checkSize, embeddedErrors, sha256File, sidecarTable } from "./release-check.mjs";
import { TRIPLE } from "./build-sidecars-windows.mjs";
import { root } from "./versions.mjs";

const SIDECARS = ["asr-worker-vulkan", "asr-worker-cpu", "llama-server"];

/** Tham số của `tauri build --no-bundle` (phần `build`) và `tauri bundle` (phần `bundle`, kèm file cấu hình ký nếu có). */
export function tauriArgs(phase, signConfig) {
  const config = ["--config", "src-tauri/release/tauri.windows.json"];
  if (phase === "build") return ["tauri", "build", "--ci", "--no-bundle", ...config, "--", "--locked"];
  const args = ["tauri", "bundle", "--ci", "--bundles", "nsis", ...config];
  if (signConfig) args.push("--config", signConfig);
  return args;
}

/** Cấu hình ký của Tauri: gọi sign-windows.mjs bằng đường dẫn tuyệt đối (thư mục làm việc của bundler không cố định). */
export function signConfig(scriptPath) {
  return { bundle: { windows: { signCommand: { cmd: "node", args: [scriptPath, "%1"] } } } };
}

/** Bộ cài trong thư mục bundle/nsis: đúng một file `<tên>_<phiên bản>_x64-setup.exe`. */
export function findInstaller(names, product, version) {
  const name = `${product}_${version}_x64-setup.exe`;
  if (!names.includes(name)) throw new Error(`không thấy ${name} (có: ${names.join(", ") || "không có file nào"})`);
  return name;
}

function pnpm(args, env) {
  execFileSync("pnpm", args, { cwd: root, stdio: "inherit", env, shell: process.platform === "win32" });
}

export function main(phase = "all") {
  if (!["all", "build", "bundle"].includes(phase)) throw new Error(`phần không rõ: ${phase} (dùng build, bundle, hoặc để trống)`);
  const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");
  const work = process.env.MT_RELEASE_WORK ?? join(root, "target", "release-work");
  const out = process.env.MT_RELEASE_OUT ?? join(target, "release-out");
  const binaries = join(root, "src-tauri", "binaries");
  for (const name of SIDECARS) {
    if (!existsSync(join(binaries, `${name}-${TRIPLE}.exe`))) {
      throw new Error(`thiếu src-tauri/binaries/${name}-${TRIPLE}.exe: chạy build-sidecars-windows.mjs trước`);
    }
  }
  if (!existsSync(join(root, "THIRD_PARTY_NOTICES.txt"))) throw new Error("thiếu THIRD_PARTY_NOTICES.txt: chạy notices.mjs trước");
  mkdirSync(out, { recursive: true });

  const table = join(work, "binaries-before-build.json");
  const exe = join(target, "release", "meeting-translator.exe");
  const errors = [];
  if (phase !== "bundle") {
    mkdirSync(work, { recursive: true });
    const before = JSON.stringify(sidecarTable(binaries, TRIPLE));
    writeFileSync(table, before);
    pnpm(tauriArgs("build", null), process.env);
    if (JSON.stringify(sidecarTable(binaries, TRIPLE)) !== before) errors.push("src-tauri/binaries/ bị đổi trong lúc build");
    errors.push(...embeddedErrors(readFileSync(exe), sidecarTable(binaries, TRIPLE)));
    if (phase === "build" || errors.length > 0) return errors;
  } else if (!existsSync(table)) {
    throw new Error(`thiếu ${table}: chạy package-windows.mjs build trước`);
  } else {
    // Phần `bundle` nhận file chạy của app từ artifact của job khác: kiểm lại nó nhúng đúng bảng SHA-256 của tiến trình
    // phụ mà job này ký (N-A của review 07a lần 3).
    errors.push(...embeddedErrors(readFileSync(exe), sidecarTable(binaries, TRIPLE)));
    if (errors.length > 0) return errors;
  }
  const before = readFileSync(table, "utf8");
  let signFile = null;
  if (process.env.MT_WINDOWS_SIGN_CMD) {
    signFile = join(work, "tauri.windows.sign.json");
    mkdirSync(work, { recursive: true });
    writeFileSync(signFile, JSON.stringify(signConfig(join(root, "scripts/release/sign-windows.mjs"))));
  } else {
    console.log("chưa đặt MT_WINDOWS_SIGN_CMD: bộ cài không được ký (chỉ dùng thử nội bộ)");
  }
  pnpm(tauriArgs("bundle", signFile), process.env);
  if (JSON.stringify(sidecarTable(binaries, TRIPLE)) !== before) {
    errors.push("src-tauri/binaries/ bị đổi sau khi build app: bảng SHA-256 trong app không còn khớp (file chưa ký sẵn?)");
  }

  const nsisDir = join(target, "release", "bundle", "nsis");
  const installer = join(nsisDir, findInstaller(readdirSync(nsisDir), conf.productName, conf.version));
  const extract = join(work, "nsis-extract");
  rmSync(extract, { recursive: true, force: true });
  execFileSync("7z", ["x", "-y", `-o${extract}`, installer], { stdio: "ignore" });
  errors.push(...checkBundle(binaries, extract, TRIPLE));
  const bytes = readFileSync(installer).length;
  console.log(`${installer}: ${bytes} byte (${(bytes / 1e6).toFixed(1)} MB), ngưỡng 60000000 byte`);
  errors.push(...checkSize(bytes, 60_000_000));
  const sums = `${sha256File(installer)}  ${conf.productName}_${conf.version}_x64-setup.exe\n`;
  writeFileSync(join(out, "SHA256SUMS-windows.txt"), sums);
  process.stdout.write(sums);
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const errors = main(process.argv[2]);
    for (const error of errors) console.error(`LỖI: ${error}`);
    process.exitCode = errors.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
