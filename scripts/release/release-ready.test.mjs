// Test của release-ready.mjs: `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { isUpdaterKey, main, readinessErrors, rustProductionUrl, tagErrors } from "./release-ready.mjs";
import { root } from "./versions.mjs";

const TEST_PUBKEY = readFileSync(join(root, "src-tauri/src/updater/testdata/test.key.pub"), "utf8").trim();
const FILES = [
  "src-tauri/keys/updater-public-keys.json",
  "src-tauri/keys/manifest-public-keys.json",
  "src-tauri/keys/license-public-keys.json",
  "src-tauri/src/updater/source.rs",
  "src-tauri/src/models/source.rs",
  "src-tauri/src/license/client.rs",
  "src-tauri/src/navigation.rs",
  "src-tauri/tauri.conf.json",
];

/** Bản sao các file mà script đọc, từ repo thật (chưa có giá trị production nào). */
function copy(t) {
  const dir = mkdtempSync(join(tmpdir(), "release-ready-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const f of FILES) cpSync(join(root, f), join(dir, f));
  return dir;
}

function edit(dir, file, change) {
  const path = join(dir, file);
  writeFileSync(path, change(readFileSync(path, "utf8")));
}

const jwk = (kid) => ({ kid, x: "q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg" });
const setUrl = (url) => (text) => text.replace(/^pub const PRODUCTION_URL: Option<&str> = None;/m, `pub const PRODUCTION_URL: Option<&str> = Some("${url}");`);

/** Điền đủ mọi giá trị production. */
function fill(dir) {
  edit(dir, "src-tauri/keys/updater-public-keys.json", (t) => JSON.stringify({ ...JSON.parse(t), production: TEST_PUBKEY }));
  edit(dir, "src-tauri/keys/manifest-public-keys.json", (t) => JSON.stringify({ ...JSON.parse(t), production: [jwk("prod-1")] }));
  edit(dir, "src-tauri/keys/license-public-keys.json", (t) =>
    JSON.stringify({ ...JSON.parse(t), production: { a: jwk("prod-2026-10-1"), b: jwk("prod-2026-10-2") } }),
  );
  edit(dir, "src-tauri/src/updater/source.rs", setUrl("https://releases.example.com/desktop"));
  edit(dir, "src-tauri/src/models/source.rs", setUrl("https://releases.example.com/models/models.json"));
  edit(dir, "src-tauri/src/license/client.rs", setUrl("https://api.example.com"));
  edit(dir, "src-tauri/src/navigation.rs", (t) => t.replace('    "pay.payos.vn",\n', '    "pay.payos.vn",\n    "example.com",\n'));
}

test("đọc PRODUCTION_URL của file Rust và khóa công khai của tauri signer", () => {
  assert.equal(rustProductionUrl('pub const PRODUCTION_URL: Option<&str> = Some("https://a.example");\n'), "https://a.example");
  assert.equal(rustProductionUrl("pub const PRODUCTION_URL: Option<&str> = None;\n"), null);
  assert.throws(() => rustProductionUrl("const X: u8 = 1;"), /không thấy/);
  assert.equal(isUpdaterKey(TEST_PUBKEY), true);
  assert.equal(isUpdaterKey(""), false);
  assert.equal(isUpdaterKey(Buffer.from("untrusted comment: x\nRWQ=").toString("base64")), false);
  assert.equal(isUpdaterKey(undefined), false);
});

// Cập nhật khi điền thêm giá trị production: license server đã điền 2026-10-05 (license/client.rs, license-public-keys),
// còn lại bản cập nhật, manifest model và tên miền website.
test("repo hiện tại chưa đủ: báo đúng năm giá trị còn thiếu", (t) => {
  const errors = readinessErrors(copy(t));
  assert.equal(errors.length, 5, errors.join("\n"));
  for (const part of ["updater-public-keys", "updater/source.rs", "models/source.rs", "manifest-public-keys", "EXTERNAL_HOSTS"]) {
    assert.ok(errors.some((e) => e.includes(part)), part);
  }
  for (const done of ["license/client.rs", "license-public-keys"]) {
    assert.ok(!errors.some((e) => e.includes(done)), `${done} đã điền, không được báo thiếu`);
  }
});

test("điền đủ thì qua; từng giá trị thiếu hay sai thì bị bắt", (t) => {
  const dir = copy(t);
  fill(dir);
  assert.deepEqual(readinessErrors(dir), []);
  assert.deepEqual(readinessErrors(dir, { baseUrl: "https://releases.example.com/desktop/" }), []);
  assert.match(readinessErrors(dir, { baseUrl: "https://other.example.com" })[0], /khác URL gốc build sẵn/);
  for (const [file, change, message] of [
    ["src-tauri/src/updater/source.rs", (s) => s.replace("https://releases", "http://releases"), /updater\/source.rs/],
    ["src-tauri/keys/license-public-keys.json", (s) => JSON.stringify({ ...JSON.parse(s), production: { a: jwk("p") } }), /hai ô a, b/],
    ["src-tauri/keys/manifest-public-keys.json", (s) => JSON.stringify({ ...JSON.parse(s), production: [{ ...jwk("p"), d: "bí mật" }] }), /manifest-public-keys/],
    ["src-tauri/keys/updater-public-keys.json", (s) => JSON.stringify({ ...JSON.parse(s), production: "abc" }), /updater-public-keys/],
  ]) {
    const one = copy(t);
    fill(one);
    edit(one, file, change);
    const errors = readinessErrors(one);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(errors[0], message);
  }
});

test("--tag: tag phải đúng v<version> của tauri.conf.json, kể cả bản beta", (t) => {
  assert.deepEqual(tagErrors("v0.2.0", "0.2.0"), []);
  assert.deepEqual(tagErrors("v0.2.0-beta.1", "0.2.0-beta.1"), []);
  assert.deepEqual(tagErrors("v0.2.0-beta.1", "0.2.0"), ["tag v0.2.0-beta.1 không khớp version 0.2.0 trong tauri.conf.json"]);
  assert.match(tagErrors("v0.2.0-rc.1", "0.2.0-rc.1")[0], /chỉ nhận X.Y.Z hay X.Y.Z-beta.N/);
  const dir = copy(t);
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(line));
  main(["--tag", "v0.1.0"], dir);
  assert.deepEqual(lines, ["tag v0.1.0 khớp tauri.conf.json"]);
  assert.throws(() => main(["--tag", "v0.1.1"], dir), /không khớp/);
  assert.throws(() => main([], dir), /chưa có khóa production/);
});
