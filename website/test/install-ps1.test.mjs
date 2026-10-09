// Test của script cài Windows `src/public/install.ps1` (spec 2026-10-09-windows-iwr-install-design.md):
//   node --test test/
// Phần hợp đồng (tên file, URL, tên sản phẩm, tên file chạy khớp release và app) chạy ở mọi nền tảng. Phần chạy PowerShell
// cần `pwsh` (PowerShell 7: đặt biến PWSH hoặc để trong PATH), không có thì bỏ qua. Script chạy thật (cài bộ NSIS) chỉ kiểm
// được trên Windows: xem mục "Kiểm tay" của spec.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "../../scripts/release/take-artifact.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = join(ROOT, "website/src/public/install.ps1");
const HELPERS = join(ROOT, "website/test/install-ps1.helpers.ps1");
const script = readFileSync(SCRIPT, "utf8");
const conf = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
const cargo = readFileSync(join(ROOT, "src-tauri/Cargo.toml"), "utf8");
const CMD = "irm https://aitranslator.io.vn/install.ps1 | iex";

const psVar = (name) => script.match(new RegExp(`^\\s*\\$${name}\\s*=\\s*'([^']*)'`, "m"))?.[1];
const pwsh = process.env.PWSH || (spawnSync("pwsh", ["-NoProfile", "-Command", "1"]).status === 0 ? "pwsh" : null);
const skip = pwsh ? false : "cần pwsh (PowerShell 7)";

test("hợp đồng với release và app: URL, tên bộ cài, SHA256SUMS, tên file chạy, tên sản phẩm", () => {
  assert.equal(psVar("BaseUrl"), "https://releases.aitranslator.io.vn");
  assert.match(readFileSync(join(ROOT, "src-tauri/src/updater/source.rs"), "utf8"), new RegExp(`Some\\("${psVar("BaseUrl")}"\\)`), "BaseUrl phải bằng PRODUCTION_URL của updater");
  assert.equal(psVar("Product"), conf.productName);
  const bin = cargo.match(/^\[package\][\s\S]*?^name = "([^"]+)"/m)?.[1];
  assert.equal(psVar("MainExe"), `${bin}.exe`, "tên file chạy chính phải khớp binary của app");
  const files = RULES["windows-x64"]("1.2.3").required;
  assert.ok(files.includes("AI Translator_1.2.3_x64-setup.exe"));
  assert.ok(script.includes('$setupName = "${Product}_${version}_x64-setup.exe"'), "mẫu tên bộ cài lệch mẫu của release");
  assert.ok(files.includes("SHA256SUMS-windows.txt") && script.includes("SHA256SUMS-windows.txt"));
  assert.ok(script.includes('"$BaseUrl/$channel/latest.json"') && script.includes("$BaseUrl/$version/SHA256SUMS-windows.txt"));
  assert.ok(script.includes("-ArgumentList '/S'"), "bộ cài NSIS của Tauri chạy im lặng bằng /S");
  assert.ok(!script.includes("'/R'"), "không dùng /R: Start-Process -Wait sẽ đợi cả app vừa mở");
  assert.ok(!/(^|\n)\s*exit\b/.test(script.replace(/^\s*#.*$/gm, "")), "không dùng exit: sẽ đóng cửa sổ PowerShell của người dùng khi chạy bằng iex");
  assert.ok(!/RunAs|-Verb\s+runas/i.test(script), "không đòi quyền quản trị");
});

test("lệnh trên header của script và trên các trang tải giống hệt nhau", () => {
  assert.ok(script.includes(`#   ${CMD}\n`));
  for (const f of ["vi/download.mjs", "en/download.mjs", "vi/guide-install-windows.mjs", "en/guide-install-windows.mjs"]) {
    assert.ok(readFileSync(join(ROOT, "website/src/content", f), "utf8").includes(CMD), `${f} thiếu dòng lệnh`);
  }
});

test("script không có BOM (BOM làm iex lỗi)", () => {
  const raw = readFileSync(SCRIPT);
  assert.notDeepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], "script không được có BOM UTF-8");
});

test("PowerShell phân tích cú pháp được; các hàm thuần đạt", { skip }, () => {
  const r = spawnSync(pwsh, ["-NoProfile", "-File", HELPERS, "-Script", SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok((r.stdout.match(/^OK /gm) ?? []).length >= 15, r.stdout);
  assert.ok(!/^FAIL/m.test(r.stdout), r.stdout);
});

test("chạy trên hệ điều hành không phải Windows: báo lỗi rõ, không đóng shell (thoát 0), không tải gì", { skip }, () => {
  if (process.platform === "win32") return;
  const r = spawnSync(pwsh, ["-NoProfile", "-File", SCRIPT], { encoding: "utf8", env: { ...process.env, AI_TRANSLATOR_LANG: "en" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Windows only/);
});
