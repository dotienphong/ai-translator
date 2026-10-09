// Test của script cài macOS `src/public/install.sh` (spec 2026-10-09-macos-curl-install-design.md):
//   node --test test/
// Phần hợp đồng (tên file, URL, mã định danh khớp release và app) chạy ở mọi nền tảng. Phần chạy script thật dùng một
// `curl` giả (không mạng) và một .dmg giả dựng bằng hdiutil, nên chỉ chạy trên Mac Apple Silicon macOS 14.2+.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "../../scripts/release/take-artifact.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = join(ROOT, "website/src/public/install.sh");
const script = readFileSync(SCRIPT, "utf8");
const conf = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
const macConf = JSON.parse(readFileSync(join(ROOT, "src-tauri/release/tauri.macos.json"), "utf8"));
const CMD = "curl -fsSL https://aitranslator.io.vn/install.sh | bash";

const shVar = (name) => script.match(new RegExp(`^\\s*${name}="([^"]*)"`, "m"))?.[1];

test("cú pháp bash hợp lệ, toàn bộ script nằm trong hàm main chỉ gọi ở dòng cuối", () => {
  const r = spawnSync("bash", ["-n", SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(script.startsWith("#!/bin/bash\n"));
  assert.ok(script.trimEnd().endsWith('main "$@"'), "dòng cuối phải là main \"$@\": đường truyền đứt giữa chừng thì không chạy nửa script");
  assert.equal((script.match(/^main\(\) \{$/gm) ?? []).length, 1);
  assert.ok(!/^\s*(?:\S+\s*[|&;]\s*)?sudo\s/m.test(script), "script không được gọi sudo");
});

test("hợp đồng với release: URL, tên file bộ cài, SHA256SUMS, mã định danh, tên sản phẩm", () => {
  assert.equal(shVar("BASE_URL"), "https://releases.aitranslator.io.vn");
  assert.match(readFileSync(join(ROOT, "src-tauri/src/updater/source.rs"), "utf8"), new RegExp(`Some\\("${shVar("BASE_URL")}"\\)`), "BASE_URL phải bằng PRODUCTION_URL của updater");
  assert.equal(shVar("PRODUCT"), conf.productName);
  assert.equal(shVar("BUNDLE_ID"), conf.identifier);
  // Tên file bộ cài trên R2 do package-macos.sh/take-artifact.mjs quyết định; script ghép lại cùng mẫu đó.
  const files = RULES["macos-arm64"]("1.2.3").required;
  assert.ok(files.includes("AI Translator_1.2.3_aarch64.dmg"));
  assert.ok(script.includes('dmg_name="${PRODUCT}_${version}_aarch64.dmg"'), "mẫu tên .dmg trong script lệch mẫu của release");
  assert.ok(files.includes("SHA256SUMS-macos.txt") && script.includes("SHA256SUMS-macos.txt"));
  assert.ok(script.includes('"$BASE_URL/$channel/latest.json"') && script.includes('"$BASE_URL/$version/'), "đường dẫn kênh và phiên bản phải đúng cấu trúc R2");
  assert.ok(script.includes("-lt 14") && script.includes("-lt 2"), "kiểm macOS 14.2");
  assert.equal(macConf.bundle?.macOS?.minimumSystemVersion ?? "14.2", "14.2");
});

test("dòng lệnh trên header của script và trên mọi trang tải giống hệt nhau", async () => {
  assert.ok(script.includes(`#   ${CMD}\n`));
  for (const f of ["vi/download.mjs", "en/download.mjs", "vi/guide-install-macos.mjs", "en/guide-install-macos.mjs"]) {
    assert.ok(readFileSync(join(ROOT, "website/src/content", f), "utf8").includes(CMD), `${f} thiếu dòng lệnh`);
  }
});

test("tham số: --help thoát 0, tham số lạ thoát khác 0", () => {
  const env = { ...process.env, AI_TRANSLATOR_LANG: "en" };
  assert.equal(spawnSync("bash", [SCRIPT, "--help"], { env, encoding: "utf8" }).status, 0);
  const r = spawnSync("bash", [SCRIPT, "--bogus"], { env, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown option/);
});

// ---------------------------------------------------------------------------------------------------------------------
const mac = process.platform === "darwin" &&
  spawnSync("sysctl", ["-n", "hw.optional.arm64"], { encoding: "utf8" }).stdout.trim() === "1" &&
  /^(1[5-9]|[2-9]\d)\b|^14\.([2-9]|\d\d)/.test(spawnSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).stdout.trim());
const skip = mac ? false : "cần Mac Apple Silicon, macOS 14.2+";

/** Dựng một "máy chủ" giả: <site>/<kênh>/latest.json, <site>/<ver>/<dmg>, <site>/<ver>/SHA256SUMS-macos.txt và curl giả. */
function fixture(t, { version = "9.9.9", sums } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "install-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const site = join(dir, "site");
  const bin = join(dir, "bin");
  const inst = join(dir, "Applications");
  for (const d of [join(site, "stable"), join(site, version), bin, inst]) mkdirSync(d, { recursive: true });

  // .app giả: Mach-O hợp lệ (bản sao /usr/bin/true) ký ad-hoc, đúng mã định danh và tên file chạy như app thật.
  const app = join(dir, "stage", "AI Translator.app");
  mkdirSync(join(app, "Contents/MacOS"), { recursive: true });
  copyFileSync("/usr/bin/true", join(app, "Contents/MacOS/meeting-translator"));
  writeFileSync(join(app, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${conf.identifier}</string><key>CFBundleExecutable</key><string>meeting-translator</string><key>CFBundleName</key><string>AI Translator</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`);
  assert.equal(spawnSync("codesign", ["--force", "-s", "-", app]).status, 0);
  const dmg = join(site, version, `AI Translator_${version}_aarch64.dmg`);
  const made = spawnSync("hdiutil", ["create", "-quiet", "-volname", "AI Translator", "-srcfolder", join(dir, "stage"), "-fs", "HFS+", "-format", "UDZO", dmg]);
  assert.equal(made.status, 0, String(made.stderr));
  const sha = createHash("sha256").update(readFileSync(dmg)).digest("hex");
  writeFileSync(join(site, version, "SHA256SUMS-macos.txt"), sums ?? `${sha}  AI Translator_${version}_aarch64.dmg\n`);
  writeFileSync(join(site, "stable/latest.json"), JSON.stringify({ version }));

  writeFileSync(join(bin, "curl"), `#!/bin/sh
out=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift ;; https://*) url="$1" ;; esac
  shift
done
path=$(printf '%s' "\${url#https://releases.aitranslator.io.vn/}" | sed 's/%20/ /g')
[ -f "${site}/$path" ] || exit 22
if [ -n "$out" ]; then cp "${site}/$path" "$out"; else cat "${site}/$path"; fi
`);
  chmodSync(join(bin, "curl"), 0o755);
  // osascript giả: test không bao giờ được hỏi hay đóng AI Translator thật đang chạy trên máy (cùng mã định danh).
  writeFileSync(join(bin, "osascript"), "#!/bin/sh\necho false\n");
  chmodSync(join(bin, "osascript"), 0o755);

  const run = (args = [], extra = {}) =>
    spawnSync("bash", [SCRIPT, ...args], {
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: dir, AI_TRANSLATOR_LANG: "en", AI_TRANSLATOR_INSTALL_DIR: inst, AI_TRANSLATOR_NO_OPEN: "1", ...extra },
    });
  return { dir, site, inst, run, version };
}

const leftovers = (dir) => readdirSync(dir).filter((n) => n.startsWith("ai-translator-install."));

test("cài thật: tải, kiểm SHA-256, chép app đúng chữ ký, không còn cờ quarantine, dọn sạch tạm và đóng .dmg", { skip }, (t) => {
  const f = fixture(t);
  const r = f.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const app = join(f.inst, "AI Translator.app");
  assert.ok(existsSync(join(app, "Contents/MacOS/meeting-translator")));
  assert.equal(spawnSync("codesign", ["--verify", "--deep", "--strict", app]).status, 0);
  assert.notEqual(spawnSync("xattr", ["-p", "com.apple.quarantine", app]).status, 0, "app không được mang cờ quarantine");
  assert.deepEqual(leftovers(f.dir), [], "thư mục tạm phải được xóa");
  assert.ok(!spawnSync("hdiutil", ["info"], { encoding: "utf8" }).stdout.includes("ai-translator-install"), ".dmg phải được đóng");
  assert.deepEqual(readdirSync(f.inst), ["AI Translator.app"], "không để lại file tạm trong thư mục cài");
});

test("cài đè bản cũ: thay hẳn, không để bản sao lưu", { skip }, (t) => {
  const f = fixture(t);
  const old = join(f.inst, "AI Translator.app/Contents");
  mkdirSync(old, { recursive: true });
  writeFileSync(join(old, "cu.txt"), "bản cũ");
  const r = f.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!existsSync(join(old, "cu.txt")), "bản cũ phải bị thay");
  assert.deepEqual(readdirSync(f.inst), ["AI Translator.app"]);
  assert.match(r.stdout, /Keychain/, "khi cập nhật phải báo trước hộp thoại Keychain");
});

test("SHA-256 không khớp: không cài gì, thoát khác 0", { skip }, (t) => {
  const f = fixture(t, { sums: `${"0".repeat(64)}  AI Translator_9.9.9_aarch64.dmg\n` });
  const r = f.run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /SHA-256/);
  assert.deepEqual(readdirSync(f.inst), []);
  assert.deepEqual(leftovers(f.dir), []);
});

test("SHA256SUMS không có dòng của file: từ chối", { skip }, (t) => {
  const f = fixture(t, { sums: `${"a".repeat(64)}  Khac.dmg\n` });
  const r = f.run();
  assert.notEqual(r.status, 0);
  assert.deepEqual(readdirSync(f.inst), []);
});

test("kênh chưa có bản (latest.json 404): báo lỗi, thoát khác 0", { skip }, (t) => {
  const f = fixture(t);
  const r = f.run(["--beta"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /latest\.json/);
  assert.deepEqual(readdirSync(f.inst), []);
});

test("latest.json có version không hợp lệ (chống chèn đường dẫn/lệnh): từ chối", { skip }, (t) => {
  const f = fixture(t);
  writeFileSync(join(f.site, "stable/latest.json"), JSON.stringify({ version: "1.0.0/../../x" }));
  const r = f.run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /valid version/);
});

test("thư mục cài không ghi được và do người dùng chỉ định: báo lỗi, không đổi chỗ khác", { skip }, (t) => {
  const f = fixture(t);
  const r = f.run([], { AI_TRANSLATOR_INSTALL_DIR: join(f.dir, "khong-co", "thu-muc") });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /cannot write/);
});
