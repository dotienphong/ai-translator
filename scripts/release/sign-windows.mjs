#!/usr/bin/env node
// Ký một file Windows (.exe, .dll) bằng dịch vụ ký cloud của chứng thư OV (spec §6.11, §10.2; T2 của kế hoạch 00).
//
//   node scripts/release/sign-windows.mjs <file>
//
// Lệnh ký của từng dịch vụ khác nhau, nên lấy từ biến MT_WINDOWS_SIGN_CMD (biến cấu hình của CI, không phải bí mật), trong
// đó `{file}` được thay bằng đường dẫn file trong dấu nháy. Thông tin đăng nhập của dịch vụ ký nằm trong secret của CI, mà
// lệnh đó tự đọc từ biến môi trường. Tauri gọi script này qua `bundle.windows.signCommand` (package-windows.mjs) cho file
// chạy của app, bộ cài và bộ gỡ; build-sidecars-windows.mjs gọi nó cho tiến trình phụ và DLL trước khi build app.

import { execSync } from "node:child_process";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Ký tự được phép trong đường dẫn đưa vào dòng lệnh của `cmd.exe`. Không có `%` (trong nháy kép `cmd.exe` vẫn mở `%BIẾN%`,
 * nên một tên file từ artifact có thể đưa giá trị secret của dịch vụ ký lên dòng lệnh; N-1 của review 07a lần 2), không
 * nháy, `^`, `&`, `|`, `<`, `>`, `!`. `~` được phép (tên ngắn 8.3 của thư mục tạm, ví dụ `RUNNER~1`, nơi Tauri ký bộ gỡ).
 * Tên file còn chặt hơn: chữ, số, `.`, `_`, `-`, dấu cách.
 */
const SAFE_PATH = /^[A-Za-z0-9 ._~:\\/-]+$/;
const SAFE_NAME = /^[A-Za-z0-9 ._-]+$/;

/** Dòng lệnh ký cho `file`. */
export function signCommandLine(template, file) {
  if (!template) throw new Error("chưa đặt MT_WINDOWS_SIGN_CMD");
  if (!template.includes("{file}")) throw new Error("MT_WINDOWS_SIGN_CMD phải có {file}");
  if (!SAFE_PATH.test(file) || !SAFE_NAME.test(basename(file.replaceAll("\\", "/")))) {
    throw new Error(`đường dẫn có ký tự không cho phép: ${JSON.stringify(file)}`);
  }
  return template.replaceAll("{file}", `"${file}"`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error("thiếu <file>");
    execSync(signCommandLine(process.env.MT_WINDOWS_SIGN_CMD, file), { stdio: "inherit" });
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
