// Test scripts/gen-token-key.mjs, chạy bằng `node --test` (pnpm test:scripts), không chạy trong Vitest của Worker.
// stdout của script con là pipe nên script chịu ghi khóa riêng; khóa chỉ nằm trong bộ nhớ của test và là khóa
// ngẫu nhiên dùng một lần. Không assert nào in nội dung stdout: chỉ in độ dài hay từng trường không bí mật.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("../../scripts/gen-token-key.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("../fixtures/public-keys.test.json", import.meta.url));
const badRetired = fileURLToPath(new URL("../fixtures/public-keys.bad-retired.test.json", import.meta.url));
const missing = fileURLToPath(new URL("../fixtures/khong-co-file-nay.json", import.meta.url));
const defaultKeys = fileURLToPath(new URL("../../keys/public-keys.json", import.meta.url));

function run(...args) {
  const r = spawnSync(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("stdout vào /dev/null (thiết bị ký tự, không phải pipe): thoát mã 2", () => {
  const devNull = openSync("/dev/null", "w");
  try {
    const r = spawnSync(process.execPath, [script, "prod-2026-10-1", "--keys", fixture], {
      stdio: ["ignore", devNull, "pipe"],
      encoding: "utf8",
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /stdout phải là pipe/);
  } finally {
    closeSync(devNull);
  }
});

/** Đọc JWK từ stdout mà không để lỗi JSON.parse chép một đoạn khóa riêng vào thông báo lỗi. */
function parseJwk(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`stdout không phải JSON (${stdout.length} byte)`);
  }
}

test("--keys chỉ tới file không tồn tại: báo lỗi, thoát mã 2, không sinh khóa", () => {
  assert.equal(existsSync(missing), false);
  const r = run("prod-2026-10-1", "--keys", missing);
  assert.equal(r.stdout.length, 0);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /không có file khóa công khai/);
  assert.ok(r.stderr.includes(missing));
});

test("--keys chỉ tới file có sẵn và kid mới: sinh khóa vào pipe", () => {
  const r = run("prod-2026-10-1", "--keys", fixture);
  assert.equal(r.status, 0);
  const jwk = parseJwk(r.stdout);
  assert.equal(jwk.kty, "OKP");
  assert.equal(jwk.crv, "Ed25519");
  assert.equal(jwk.kid, "prod-2026-10-1");
  assert.equal(typeof jwk.d, "string");
  assert.equal(jwk.d.length, 43);
  assert.ok(r.stderr.includes(`{"kid":"prod-2026-10-1","x":"${jwk.x}"}`));
});

test("kid đã dùng rồi bỏ (có trong retired của public-keys.json): từ chối, thoát mã 2, không sinh khóa", () => {
  const r = run("prod-2026-09-1", "--keys", fixture);
  assert.equal(r.stdout.length, 0);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /kid prod-2026-09-1 đã dùng rồi bỏ \(retired trong public-keys\.json\)\. Dùng số thứ tự mới\./);
});

test("retired không phải mảng: báo lỗi, thoát mã 2, không sinh khóa", () => {
  const r = run("prod-2026-10-1", "--keys", badRetired);
  assert.equal(r.stdout.length, 0);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /retired trong public-keys\.json phải là mảng/);
});

test("không có --keys và file mặc định chưa có (trước lần tạo khóa đầu tiên): vẫn sinh khóa", { skip: existsSync(defaultKeys) }, () => {
  const r = run("prod-2026-10-1");
  assert.equal(r.status, 0);
  assert.equal(parseJwk(r.stdout).kid, "prod-2026-10-1");
});

test("kid không theo prod-<năm>-<tháng>-<số thứ tự>: từ chối, thoát mã 2, không sinh khóa", () => {
  for (const kid of ["node-test-1", "stg-2026-10-1", "test-1", "prod-2026-10-0", "prod-2026-10-01", "prod-26-10-1", "prod-2026-1-1", "Prod-2026-10-1"]) {
    const r = run(kid, "--keys", fixture);
    assert.equal(r.stdout.length, 0, kid);
    assert.equal(r.status, 2, kid);
    assert.match(r.stderr, /kid phải dạng prod-<năm>-<tháng>-<số thứ tự>/, kid);
  }
  const r = run();
  assert.equal(r.status, 2);
});
