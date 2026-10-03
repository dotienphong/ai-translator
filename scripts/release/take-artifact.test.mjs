// Test của take-artifact.mjs (QA của review 07a lần 2): `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { RULES, plan, take } from "./take-artifact.mjs";

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "take-artifact-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function put(dir, files) {
  for (const rel of files) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), `nội dung ${rel}`);
  }
}

const MAC_SIDECARS = [
  "src-tauri/binaries/asr-worker-aarch64-apple-darwin",
  "src-tauri/binaries/llama-server-aarch64-apple-darwin",
  "THIRD_PARTY_NOTICES.txt",
];
const WIN_SIDECARS = [
  "src-tauri/binaries/asr-worker-vulkan-x86_64-pc-windows-msvc.exe",
  "src-tauri/binaries/asr-worker-cpu-x86_64-pc-windows-msvc.exe",
  "src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe",
  "src-tauri/binaries/ggml-vulkan.dll",
  "src-tauri/binaries/ggml-cpu-haswell.dll",
  "THIRD_PARTY_NOTICES.txt",
];

test("nhận đúng file chờ đợi, chép vào đích, in SHA-256", (t) => {
  const from = tempDir(t);
  const to = tempDir(t);
  put(from, MAC_SIDECARS);
  const lines = [];
  assert.deepEqual(take("macos-sidecars", from, to, (l) => lines.push(l)).sort(), [...MAC_SIDECARS].sort());
  assert.equal(readFileSync(join(to, MAC_SIDECARS[0]), "utf8"), `nội dung ${MAC_SIDECARS[0]}`);
  assert.match(lines[0], /^nhận \S.* \(\d+ byte, sha256 [0-9a-f]{64}\)$/);
  const win = tempDir(t);
  put(win, WIN_SIDECARS);
  assert.deepEqual(plan("windows-sidecars", win).errors, []);
});

test("script của repo, file lạ, thư mục lạ, symlink hay thiếu file: lỗi và không chép gì", (t) => {
  for (const [extra, message] of [
    [["scripts/release/macos-keychain.sh"], /thư mục lạ: scripts.*file lạ: scripts\/release\/macos-keychain.sh/],
    [["src-tauri/binaries/libggml.dylib"], /file lạ: src-tauri\/binaries\/libggml.dylib/],
    [["evil.txt"], /file lạ: evil.txt/],
  ]) {
    const from = tempDir(t);
    const to = tempDir(t);
    put(from, [...MAC_SIDECARS, ...extra]);
    assert.throws(() => take("macos-sidecars", from, to, () => {}), message);
    assert.deepEqual(readdirSync(to), [], "không chép gì");
  }
  // Symlink đúng tên của một file chờ đợi (ví dụ trỏ tới file của hệ thống) cũng không nhận.
  const link = tempDir(t);
  put(link, MAC_SIDECARS.slice(1));
  symlinkSync("/etc/hosts", join(link, MAC_SIDECARS[0]));
  assert.throws(() => take("macos-sidecars", link, tempDir(t), () => {}), /không phải file thường \(symlink\)/);
  const missing = tempDir(t);
  put(missing, MAC_SIDECARS.slice(1));
  assert.throws(() => take("macos-sidecars", missing, tempDir(t), () => {}), /thiếu src-tauri\/binaries\/asr-worker/);
  assert.match(plan("khác", missing).errors[0], /artifact lạ/);
});

test("tên DLL và bộ cài chặt: không %, nháy, &, thư mục con", (t) => {
  for (const bad of ["src-tauri/binaries/%MT_SIGN_SECRET%.dll", "src-tauri/binaries/a&b.dll", "src-tauri/binaries/sub/x.dll"]) {
    const from = tempDir(t);
    put(from, [...WIN_SIDECARS, bad]);
    assert.notDeepEqual(plan("windows-sidecars", from).errors, [], bad);
  }
  const signed = tempDir(t);
  put(signed, ["asr-worker-vulkan-x86_64-pc-windows-msvc.exe", "asr-worker-cpu-x86_64-pc-windows-msvc.exe",
    "llama-server-x86_64-pc-windows-msvc.exe", "ggml-base.dll"]);
  assert.deepEqual(plan("windows-sidecars-signed", signed).errors, []);
  const out = tempDir(t);
  const files = [
    "AI Translator_0.2.0-beta.1_aarch64.dmg", "AI Translator.app.tar.gz", "SHA256SUMS-macos.txt", "sidecar-sha256-macos.json",
    "THIRD_PARTY_NOTICES-macos.txt", "AI Translator_0.2.0-beta.1_x64-setup.exe", "SHA256SUMS-windows.txt",
    "sidecar-sha256-windows.json", "THIRD_PARTY_NOTICES-windows.txt",
  ];
  put(out, files);
  put(out, ["AI Translator.app.tar.gz.sig", "AI Translator_0.2.0-beta.1_x64-setup.exe.sig"]);
  assert.deepEqual(plan("release", out).errors, []);
  const mac = tempDir(t);
  put(mac, files.slice(0, 5));
  assert.deepEqual(plan("macos-arm64", mac).errors, []);
  put(mac, ["AI Translator_0.2.0-beta.1_x64-setup.exe"]);
  assert.match(plan("macos-arm64", mac).errors[0], /file lạ: AI Translator_0.2.0-beta.1_x64-setup.exe/);
  const pct = tempDir(t);
  put(pct, [...files, "%TAURI_SIGNING_PRIVATE_KEY%.sig"]);
  assert.match(plan("release", pct).errors[0], /ký tự không cho phép/);
  put(out, ["AI Translator_9_aarch64.dmg"]);
  assert.match(plan("release", out).errors[0], /file lạ/);
});

test("job có secret chỉ tải artifact theo tên vào $RUNNER_TEMP/in/, chỉ take-artifact đọc ở đó, mọi artifact đó đều có luật", () => {
  const yml = readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
  const jobs = yml.split(/\n(?=  [a-z][a-z0-9-]*:\n)/).slice(1);
  const secret = jobs.filter((j) => /\n    environment: release\n/.test(j));
  assert.ok(secret.length >= 5, String(secret.length));
  for (const job of secret) {
    const name = job.slice(2, job.indexOf(":"));
    for (const step of job.split("\n      - ").filter((s) => s.startsWith("uses: actions/download-artifact@"))) {
      // Tải theo đúng một tên (Q-1 của review 07a lần 3), vào $RUNNER_TEMP/in/<tên>.
      const artifact = /\n          name: ([a-z0-9-]+)\n/.exec(step)?.[1];
      assert.ok(artifact, `${name}: tải không theo tên: ${step}`);
      assert.doesNotMatch(step, /pattern:|merge-multiple:/, `${name}: ${step}`);
      assert.match(step, new RegExp(`\\n          path: \\$\\{\\{ runner\\.temp \\}\\}/in/${artifact}\\n?`), `${name}: ${step}`);
    }
  }
  // Chỉ bước tải (dòng `path:`) và `take-artifact.mjs` đụng tới thư mục của artifact chưa kiểm (N-B của review lần 3).
  for (const line of yml.split("\n").filter((l) => /RUNNER_TEMP\/in\/|runner\.temp \}\}\/in\//.test(l))) {
    assert.match(line, /^\s+path: \$\{\{ runner\.temp \}\}\/in\/[a-z0-9-]+$|^\s+(run: )?node scripts\/release\/take-artifact\.mjs [a-z0-9-]+ "\$RUNNER_TEMP\/in\/[a-z0-9-]+" \S+$/, line);
  }
  const taken = [...yml.matchAll(/take-artifact\.mjs (\S+) /g)].map((m) => m[1]);
  assert.ok(taken.length >= 9, taken.join(","));
  for (const name of taken) assert.ok(RULES[name], name);
  assert.equal(existsSync(new URL("./take-artifact.mjs", import.meta.url)), true);
});
