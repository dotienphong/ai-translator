#!/usr/bin/env node
// Ký bản cập nhật của tauri-plugin-updater (Q17 của kế hoạch 00; spec §6.11). Chạy ở job riêng của release.yml, job duy
// nhất có TAURI_SIGNING_PRIVATE_KEY, trên runner mới, không biên dịch gì (Q1 của review 07a lần 1).
//
//   node scripts/release/sign-updates.mjs --dir <thư mục có bộ cài của hai nền tảng>
//
// Ký `<tên>.app.tar.gz` (macOS) và `<tên>_<phiên bản>_x64-setup.exe` (Windows) bằng `tauri signer sign --app-version`
// (chữ ký gắn phiên bản, để updater bật requireSignedVersion), ra file `.sig` cạnh mỗi file. Khóa đọc từ biến môi trường
// TAURI_SIGNING_PRIVATE_KEY (và _PASSWORD), không qua tham số dòng lệnh. Chưa có khóa thì không ký gì và báo.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { root } from "./versions.mjs";

/** Các file bản cập nhật cần ký trong `present` (tên file có trong thư mục), theo tên sản phẩm và phiên bản. */
export function updateFiles(present, product, version) {
  const wanted = [`${product}.app.tar.gz`, `${product}_${version}_x64-setup.exe`];
  return wanted.filter((name) => present.includes(name));
}

/** Tham số của `pnpm` để ký một file. */
export function signerArgs(version, file) {
  return ["tauri", "signer", "sign", "--app-version", version, file];
}

/** Tham số khi chạy qua shell (Windows: `pnpm` là pnpm.cmd, chỉ chạy được qua shell): tham số có khoảng trắng, như
 *  `AI Translator.app.tar.gz`, phải nằm trong dấu nháy, nếu không bị tách thành hai tham số. */
export function shellArgs(args, platform = process.platform) {
  return platform === "win32" ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
}

export function main(argv, env = process.env) {
  const i = argv.indexOf("--dir");
  if (i < 0 || !argv[i + 1]) throw new Error("thiếu --dir <thư mục>");
  const dir = argv[i + 1];
  const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  const present = [`${conf.productName}.app.tar.gz`, `${conf.productName}_${conf.version}_x64-setup.exe`].filter((n) =>
    existsSync(join(dir, n)),
  );
  const files = updateFiles(present, conf.productName, conf.version);
  if (files.length === 0) throw new Error(`không có bản cập nhật nào trong ${dir}`);
  if (!env.TAURI_SIGNING_PRIVATE_KEY) {
    console.log(`chưa có khóa ký bản cập nhật: không ký ${files.join(", ")}`);
    return [];
  }
  for (const name of files) {
    execFileSync("pnpm", shellArgs(signerArgs(conf.version, join(dir, name))), {
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
      env,
      shell: process.platform === "win32",
    });
    if (!existsSync(join(dir, `${name}.sig`))) throw new Error(`tauri signer không tạo ${name}.sig`);
    console.log(`đã ký ${name}`);
  }
  return files;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
