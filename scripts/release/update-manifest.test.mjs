// Test của update-manifest.mjs: `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { artifactNames, channelsFor, compareVersions, main, parseVersion, releaseManifest } from "./update-manifest.mjs";
import { root } from "./versions.mjs";

const cmp = (a, b) => compareVersions(parseVersion(a), parseVersion(b));

test("phiên bản: chỉ X.Y.Z hay X.Y.Z-beta.N; bản beta nhỏ hơn bản stable cùng số", () => {
  assert.equal(parseVersion("1.2.3").beta, null);
  assert.equal(parseVersion("1.2.3-beta.4").beta, 4);
  for (const bad of ["1.2", "v1.2.3", "1.2.3-rc.1", "01.2.3", "1.2.3-beta", "1.2.3+build"]) assert.equal(parseVersion(bad), null, bad);
  assert.equal(cmp("0.2.0-beta.1", "0.2.0"), -1);
  assert.equal(cmp("0.2.0-beta.2", "0.2.0-beta.10"), -1);
  assert.equal(cmp("0.10.0", "0.9.9"), 1);
  assert.equal(cmp("0.2.0", "0.2.0"), 0);
});

test("bản stable vào stable, và vào beta khi mới hơn bản beta đang có; bản beta chỉ vào beta", () => {
  assert.deepEqual(channelsFor("0.2.0", { stable: null, beta: null }), ["stable", "beta"]);
  assert.deepEqual(channelsFor("0.2.0", { stable: "0.1.0", beta: "0.3.0-beta.1" }), ["stable"]);
  assert.deepEqual(channelsFor("0.3.0", { stable: "0.2.0", beta: "0.3.0-beta.1" }), ["stable", "beta"]);
  assert.deepEqual(channelsFor("0.3.0-beta.2", { stable: "0.2.0", beta: "0.3.0-beta.1" }), ["beta"]);
  assert.throws(() => channelsFor("0.2.0", { stable: "0.2.0", beta: null }), /stable đã có 0.2.0/);
  assert.throws(() => channelsFor("0.3.0-beta.1", { stable: null, beta: "0.3.0" }), /beta đã có 0.3.0/);
  assert.throws(() => channelsFor("0.3", { stable: null, beta: null }), /sai dạng/);
});

test("latest.json có bốn khóa nền tảng, URL theo phiên bản, chữ ký nguyên văn", () => {
  const names = artifactNames("AI Translator", "0.2.0");
  assert.deepEqual(names, { mac: "AI Translator.app.tar.gz", windows: "AI Translator_0.2.0_x64-setup.exe" });
  const m = releaseManifest({
    version: "0.2.0",
    baseUrl: "https://cdn.example/releases/",
    names,
    signatures: { mac: "SIG-MAC", windows: "SIG-WIN" },
    notes: "Sửa lỗi",
    pubDate: "2026-10-03T00:00:00Z",
  });
  assert.deepEqual(Object.keys(m.platforms), ["darwin-aarch64-app", "darwin-aarch64", "windows-x86_64-nsis", "windows-x86_64"]);
  assert.equal(m.platforms["darwin-aarch64-app"].url, "https://cdn.example/releases/0.2.0/AI%20Translator.app.tar.gz");
  assert.equal(m.platforms["windows-x86_64"].url, "https://cdn.example/releases/0.2.0/AI%20Translator_0.2.0_x64-setup.exe");
  assert.equal(m.platforms["windows-x86_64-nsis"].signature, "SIG-WIN");
  assert.equal(m.version, "0.2.0");
});

test("CLI: đọc file .sig, ghi latest.json của từng kênh; thiếu chữ ký hay URL không https thì lỗi", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "update-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ["AI Translator.app.tar.gz", "AI Translator_0.2.0_x64-setup.exe"]) {
    writeFileSync(join(dir, name), "x");
    writeFileSync(join(dir, `${name}.sig`), `sig of ${name}\n`);
  }
  const base = ["--version", "0.2.0", "--dir", dir, "--out", join(dir, "out"), "--pub-date", "2026-10-03T00:00:00Z"];
  assert.deepEqual(main([...base, "--base-url", "https://cdn.example/releases"]), ["stable", "beta"]);
  const stable = JSON.parse(readFileSync(join(dir, "out", "stable", "latest.json"), "utf8"));
  assert.equal(stable.platforms["darwin-aarch64"].signature, "sig of AI Translator.app.tar.gz");
  assert.deepEqual(stable, JSON.parse(readFileSync(join(dir, "out", "beta", "latest.json"), "utf8")));
  assert.throws(() => main([...base, "--base-url", "http://cdn.example/releases"]), /phải là https/);
  rmSync(join(dir, "AI Translator.app.tar.gz.sig"));
  assert.throws(() => main([...base, "--base-url", "https://cdn.example/releases"]), /thiếu chữ ký/);
});

test("sinh đúng từng byte file mẫu mà test của app cho plugin cập nhật thật đọc", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "update-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const testdata = join(root, "src-tauri/src/updater/testdata");
  for (const name of Object.values(artifactNames("AI Translator", "0.9.0"))) {
    copyFileSync(join(testdata, "update-0.9.0.bin"), join(dir, name));
    copyFileSync(join(testdata, "update-0.9.0.sig"), join(dir, `${name}.sig`));
  }
  writeFileSync(join(dir, "notes.md"), "Bản thử\n");
  main([
    ...["--version", "0.9.0", "--base-url", "https://releases.example.com/desktop", "--dir", dir],
    ...["--notes-file", join(dir, "notes.md"), "--pub-date", "2026-10-03T00:00:00Z", "--out", join(dir, "out")],
  ]);
  assert.equal(readFileSync(join(dir, "out", "stable", "latest.json"), "utf8"), readFileSync(join(testdata, "latest.json"), "utf8"));
});
