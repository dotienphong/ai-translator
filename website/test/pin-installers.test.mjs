// Ghim bản cài vào script cài lúc deploy (kiểm toán bảo mật 2026-10-25): `node --test test/pin-installers.test.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pinInstallPs1, pinInstallSh, pinInstallers } from "../src/build/pin-installers.mjs";

const PUBLIC = new URL("../src/public/", import.meta.url);
const sh = readFileSync(new URL("install.sh", PUBLIC), "utf8");
const ps1 = readFileSync(new URL("install.ps1", PUBLIC), "utf8");
const SHA = "ab".repeat(32);

test("install.sh: điền đúng hai dòng ghim và không đổi gì khác", () => {
  const out = pinInstallSh(sh, "1.2.3", SHA);
  assert.match(out, /^PIN_VERSION="1\.2\.3"$/m);
  assert.match(out, new RegExp(`^PIN_SHA256="${SHA}"$`, "m"));
  assert.equal(out.replace("PIN_VERSION=\"1.2.3\"", "PIN_VERSION=\"\"").replace(`PIN_SHA256="${SHA}"`, "PIN_SHA256=\"\""), sh);
});

test("install.sh đã ghim vẫn là bash hợp lệ", () => {
  const dir = mkdtempSync(join(tmpdir(), "pin-sh-"));
  try {
    const f = join(dir, "install.sh");
    writeFileSync(f, pinInstallSh(sh, "1.2.3", SHA));
    const r = spawnSync("bash", ["-n", f], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install.ps1: điền đúng hai dòng ghim, giữ thụt lề, không đổi gì khác", () => {
  const out = pinInstallPs1(ps1, "1.2.3", SHA);
  assert.match(out, /^ {4}\$PinVersion = '1\.2\.3'$/m);
  assert.match(out, new RegExp(`^ {4}\\$PinSha256 = '${SHA}'$`, "m"));
  assert.equal(out.replace("$PinVersion = '1.2.3'", "$PinVersion = ''").replace(`$PinSha256 = '${SHA}'`, "$PinSha256 = ''"), ps1);
});

test("từ chối phiên bản hay SHA-256 sai dạng (chống chèn chữ vào script)", () => {
  const bad = ['1.2', '1.2.3-beta.1', '1.2.3"; rm -rf ~ #', "1.2.3'", "", undefined, 123];
  for (const v of bad) {
    assert.throws(() => pinInstallSh(sh, v, SHA), /ghim bản cài/, String(v));
    assert.throws(() => pinInstallPs1(ps1, v, SHA), /ghim bản cài/, String(v));
  }
  for (const h of ["", "AB".repeat(32), "ab".repeat(31), `${"ab".repeat(32)}0`, "g".repeat(64), `${"ab".repeat(31)}"; x`, undefined]) {
    assert.throws(() => pinInstallSh(sh, "1.2.3", h), /ghim bản cài/, String(h));
    assert.throws(() => pinInstallPs1(ps1, "1.2.3", h), /ghim bản cài/, String(h));
  }
});

test("từ chối khi script đã ghim rồi hoặc thiếu dòng ghim (không để ghim lệch âm thầm)", () => {
  const once = pinInstallSh(sh, "1.2.3", SHA);
  assert.throws(() => pinInstallSh(once, "1.2.4", SHA), /PIN_VERSION xuất hiện 0 lần/);
  assert.throws(() => pinInstallSh(sh.replace('PIN_SHA256=""\n', ""), "1.2.3", SHA), /PIN_SHA256 xuất hiện 0 lần/);
  assert.throws(() => pinInstallSh(`${sh}\nPIN_VERSION=""\n`, "1.2.3", SHA), /PIN_VERSION xuất hiện 2 lần/);
  const oncePs = pinInstallPs1(ps1, "1.2.3", SHA);
  assert.throws(() => pinInstallPs1(oncePs, "1.2.4", SHA), /xuất hiện 0 lần/);
  assert.throws(() => pinInstallPs1("không có dòng ghim", "1.2.3", SHA), /xuất hiện 0 lần/);
});

test("pinInstallers: ghi cả hai file trong thư mục đích", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pin-dist-"));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "install.sh"), sh);
    writeFileSync(join(dir, "install.ps1"), ps1);
    await pinInstallers(dir, { version: "9.8.7", mac: "11".repeat(32), win: "22".repeat(32) });
    assert.match(readFileSync(join(dir, "install.sh"), "utf8"), new RegExp(`^PIN_SHA256="${"11".repeat(32)}"$`, "m"));
    assert.match(readFileSync(join(dir, "install.ps1"), "utf8"), new RegExp(`\\$PinSha256 = '${"22".repeat(32)}'`));
    assert.match(readFileSync(join(dir, "install.sh"), "utf8"), /^PIN_VERSION="9\.8\.7"$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bản nguồn để trống hai dòng ghim ở cả hai script (chỉ deploy mới điền)", () => {
  assert.match(sh, /^PIN_VERSION=""$/m);
  assert.match(sh, /^PIN_SHA256=""$/m);
  assert.match(ps1, /^ {4}\$PinVersion = ''$/m);
  assert.match(ps1, /^ {4}\$PinSha256 = ''$/m);
});
