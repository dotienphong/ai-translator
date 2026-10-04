// Test của các bước có secret: sign-updates.mjs, sign-manifest-ci.mjs, macos-keychain.sh (N8 của review 07a lần 1).
// Không dùng khóa thật nào: khóa ký bản cập nhật tạo mới trong thư mục tạm; `security`, `openssl` là bản giả trên PATH.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { bodyErrors, inputErrors, main as signManifest } from "./sign-manifest-ci.mjs";
import { main as signUpdates, signerArgs, updateFiles } from "./sign-updates.mjs";
import { root } from "./versions.mjs";

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "signing-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("sign-updates: chỉ ký đúng hai loại bộ cài của phiên bản hiện tại", () => {
  const present = ["AI Translator.app.tar.gz", "AI Translator_0.1.0_x64-setup.exe", "AI Translator_0.0.9_x64-setup.exe"];
  assert.deepEqual(updateFiles(present, "AI Translator", "0.1.0"), ["AI Translator.app.tar.gz", "AI Translator_0.1.0_x64-setup.exe"]);
  assert.deepEqual(updateFiles(["x.dmg"], "AI Translator", "0.1.0"), []);
  assert.deepEqual(signerArgs("0.1.0", "/d/f.exe"), ["tauri", "signer", "sign", "--app-version", "0.1.0", "/d/f.exe"]);
});

test("sign-updates: không có khóa thì không ký; có khóa thì tạo .sig gắn phiên bản", (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "AI Translator.app.tar.gz"), "app");
  writeFileSync(join(dir, "AI Translator_0.1.0_x64-setup.exe"), "exe");
  assert.deepEqual(signUpdates(["--dir", dir], { PATH: process.env.PATH }), []);
  assert.equal(existsSync(join(dir, "AI Translator.app.tar.gz.sig")), false);
  // Khóa tạm, chỉ cho test này.
  const keyFile = join(dir, "test.key");
  execFileSync("pnpm", ["tauri", "signer", "generate", "--ci", "-p", "test-only", "-w", keyFile], {
    cwd: root,
    stdio: "ignore",
    shell: process.platform === "win32", // như sign-updates.mjs: trên Windows `pnpm` là pnpm.cmd
  });
  const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyFile, "utf8"), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "test-only" };
  assert.deepEqual(signUpdates(["--dir", dir], env), ["AI Translator.app.tar.gz", "AI Translator_0.1.0_x64-setup.exe"]);
  const sig = Buffer.from(readFileSync(join(dir, "AI Translator_0.1.0_x64-setup.exe.sig"), "utf8"), "base64").toString();
  assert.match(sig, /trusted comment: .*file:AI Translator_0\.1\.0_x64-setup\.exe/);
  assert.match(sig, /version:0\.1\.0/);
  assert.throws(() => signUpdates(["--dir", tempDir(t)], env), /không có bản cập nhật nào/);
});

test("sign-manifest: BODY phải là file tương đối trong repo, không có '..'", (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, "models"));
  writeFileSync(join(dir, "models", "body.json"), "{}");
  assert.deepEqual(bodyErrors(dir, "models/body.json"), []);
  assert.deepEqual(bodyErrors(dir, ""), ["BODY trống"]);
  assert.deepEqual(bodyErrors(dir, "/etc/passwd"), ["BODY phải là đường dẫn tương đối trong repo"]);
  assert.deepEqual(bodyErrors(dir, "models/../../x.json"), ["BODY không được có '..'"]);
  assert.deepEqual(bodyErrors(dir, "models\\..\\x.json"), ["BODY không được có '..'"]);
  assert.deepEqual(bodyErrors(dir, "models/none.json"), ["không thấy models/none.json"]);
  assert.deepEqual(bodyErrors(dir, "models"), ["không thấy models"]);
});

test("sign-manifest --check: PREVIOUS bắt buộc khi đã có khóa production (N-2 của review 07a lần 2)", (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, "src-tauri", "keys"), { recursive: true });
  mkdirSync(join(dir, "models"));
  writeFileSync(join(dir, "models", "new.json"), "{}");
  writeFileSync(join(dir, "models", "old.json"), "{}");
  const keys = (production) => writeFileSync(join(dir, "src-tauri/keys/manifest-public-keys.json"), JSON.stringify({ staging: [], production }));
  keys([]);
  assert.deepEqual(inputErrors(dir, "models/new.json", ""), [], "chưa có khóa production: lần đầu");
  keys([{ kid: "prod-2026-11-1", x: "x" }]);
  assert.match(inputErrors(dir, "models/new.json", "")[0], /PREVIOUS trống/);
  assert.deepEqual(inputErrors(dir, "models/new.json", "models/old.json"), []);
  assert.deepEqual(inputErrors(dir, "models/new.json", "../old.json"), ["PREVIOUS không được có '..'"]);
  assert.deepEqual(inputErrors(dir, "models/new.json", "models/none.json"), ["không thấy models/none.json"]);
  assert.deepEqual(inputErrors(dir, "", "models/old.json"), ["BODY trống"]);
});

test("sign-manifest: khóa ghi ra file 0600 ngoài repo, con không thấy biến khóa, file khóa bị xóa kể cả khi lỗi", (t) => {
  const dir = tempDir(t);
  const fakeRoot = join(dir, "repo");
  mkdirSync(join(fakeRoot, "scripts", "models"), { recursive: true });
  writeFileSync(join(fakeRoot, "body.json"), "{}");
  const log = join(dir, "log.json");
  // sign-manifest.mjs giả: ghi lại tham số, quyền file khóa, nội dung khóa và biến môi trường mà nó thấy.
  writeFileSync(
    join(fakeRoot, "scripts", "models", "sign-manifest.mjs"),
    `import { readFileSync, statSync, writeFileSync } from "node:fs";
const a = process.argv.slice(2); const opt = (n) => a[a.indexOf(n) + 1];
writeFileSync(${JSON.stringify(log)}, JSON.stringify({ env: opt("--env"), key: opt("--key"),
  mode: (statSync(opt("--key")).mode & 0o777).toString(8), content: readFileSync(opt("--key"), "utf8"),
  sees: process.env.MANIFEST_SIGNING_KEY ?? null }));
writeFileSync(opt("--out"), "{}");
process.exit(Number(process.env.STUB_EXIT ?? 0));
`,
  );
  const env = { PATH: process.env.PATH, RUNNER_TEMP: dir, MANIFEST_SIGNING_KEY: '{"kid":"thử"}', BODY: "body.json" };
  assert.equal(signManifest(env, fakeRoot), join(fakeRoot, "target", "manifest", "models.json"));
  const seen = JSON.parse(readFileSync(log, "utf8"));
  // Windows không có quyền kiểu POSIX (NTFS báo 666): chỉ kiểm 0600 ở nơi có.
  const posixMode = process.platform === "win32" ? seen.mode : "600";
  assert.deepEqual({ ...seen, key: undefined }, { env: "production", key: undefined, mode: posixMode, content: '{"kid":"thử"}', sees: null });
  assert.equal(seen.key.startsWith(dir), true);
  assert.equal(existsSync(seen.key), false, "file khóa đã bị xóa");
  assert.throws(() => signManifest({ ...env, STUB_EXIT: "3" }, fakeRoot), /thoát mã 3/);
  assert.equal(existsSync(JSON.parse(readFileSync(log, "utf8")).key), false, "lỗi vẫn xóa file khóa");
  assert.throws(() => signManifest({ ...env, MANIFEST_SIGNING_KEY: "" }, fakeRoot), /chưa có secret/);
  assert.throws(() => signManifest({ ...env, BODY: "../x" }, fakeRoot), /không được có '..'/);
  assert.throws(() => signManifest(env, dir), /chưa có scripts\/models\/sign-manifest.mjs/);
});

/** Chạy macos-keychain.sh với `security` và `openssl` giả; bản giả ghi mọi lệnh vào calls.log. */
function runKeychain(t, { identities, importFails = false, arg = "import" }) {
  const dir = tempDir(t);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const calls = join(dir, "calls.log");
  writeFileSync(
    join(bin, "security"),
    `#!/bin/sh
echo "security $*" >> "${calls}"
case "$1" in
  import) [ "${importFails ? 1 : 0}" = 1 ] && exit 1 ;;
  find-identity) cat "${join(dir, "identities.txt")}" ;;
  create-keychain) : > "$4" ;;
  delete-keychain) rm -f "$2" ;;
esac
exit 0
`,
  );
  writeFileSync(join(dir, "identities.txt"), identities.map((i) => `${i}\n`).join(""));
  writeFileSync(join(bin, "openssl"), "#!/bin/sh\necho abcd\n");
  chmodSync(join(bin, "security"), 0o755);
  chmodSync(join(bin, "openssl"), 0o755);
  const r = spawnSync("sh", [join(root, "scripts/release/macos-keychain.sh"), arg], {
    env: { PATH: `${bin}:/usr/bin:/bin`, RUNNER_TEMP: dir, P12: Buffer.from("p12").toString("base64"), P12_PASSWORD: "pw" },
    encoding: "utf8",
  });
  const log = existsSync(calls) ? readFileSync(calls, "utf8") : "";
  // File P12 tạm nằm trong RUNNER_TEMP và không bao giờ còn lại, kể cả khi `security import` lỗi (N-2 của review cuối 07a).
  const p12 = /security import (\S+) /.exec(log)?.[1];
  if (p12) assert.equal(p12.startsWith(`${dir}/`), true, `file P12 tạm ngoài RUNNER_TEMP: ${p12}`);
  return { ...r, log, keychain: join(dir, "release.keychain-db"), leftovers: p12 && existsSync(p12) ? [p12] : [] };
}

// macos-keychain.sh chỉ chạy trên macOS (job ký của release.yml); test dùng `sh` và PATH kiểu POSIX nên bỏ qua trên Windows.
const posixOnly = { skip: process.platform === "win32" && "script chỉ dành cho macOS" };

test("keychain: nhận đúng chứng thư Developer ID hợp lệ, in lệnh đặt biến, giữ keychain", posixOnly, (t) => {
  const r = runKeychain(t, {
    identities: [
      '  1) AAAA "Apple Development: x (Y)"',
      '  2) BBBB "Developer ID Application: Công ty A (TEAMID1234)"',
      "     2 valid identities found",
    ],
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    `MT_SIGN_IDENTITY='Developer ID Application: Công ty A (TEAMID1234)'; MT_KEYCHAIN='${r.keychain}'; export MT_SIGN_IDENTITY MT_KEYCHAIN\n`,
  );
  assert.equal(existsSync(r.keychain), true);
  assert.doesNotMatch(r.log, /delete-keychain/);
  assert.match(r.log, /security import .* -f pkcs12 .* -T \/usr\/bin\/codesign/);
  assert.deepEqual(r.leftovers, []);
});

test("keychain: không có Developer ID, import lỗi, hay tên có dấu nháy đơn thì báo lỗi và xóa keychain", posixOnly, (t) => {
  for (const [opts, message] of [
    [{ identities: ['  1) AAAA "Apple Development: x (Y)"'] }, /không phải Developer ID Application/],
    [{ identities: [], importFails: true }, /^$/],
    [{ identities: [`  1) BBBB "Developer ID Application: O'Brien (TEAMID1234)"`] }, /dấu nháy đơn/],
  ]) {
    const r = runKeychain(t, opts);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr.trim(), message);
    assert.equal(r.stdout, "");
    assert.match(r.log, /delete-keychain/);
    assert.equal(existsSync(r.keychain), false);
    assert.deepEqual(r.leftovers, [], "file P12 tạm đã bị xóa");
  }
  const bad = runKeychain(t, { identities: [], arg: "nope" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /dùng: macos-keychain.sh import \| delete/);
});
