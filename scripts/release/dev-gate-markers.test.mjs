// Cổng no-dev-gate phải quét đúng các chuỗi công tắc dev mà src-tauri/src/pro.rs đang dùng (spec 2026-10-04, §3).
// Đổi tên biến công tắc hay chuỗi chim hoàng yến trong pro.rs mà quên cập nhật DEV_GATE_MARKERS thì test này fail.
// Chạy: `node --test scripts/release/dev-gate-markers.test.mjs`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEV_GATE_MARKERS } from "./release-check.mjs";

const proRs = readFileSync(fileURLToPath(new URL("../../src-tauri/src/pro.rs", import.meta.url)), "utf8");

function constValue(name) {
  const m = proRs.match(new RegExp(`pub const ${name}: &str = "([^"]*)";`));
  assert.ok(m, `không tìm thấy \`pub const ${name}: &str = "...";\` trong src-tauri/src/pro.rs`);
  return m[1];
}

for (const name of ["DEV_PRO_ENV", "DEV_GATE_CANARY"]) {
  test(`DEV_GATE_MARKERS có giá trị của ${name} trong pro.rs`, () => {
    const value = constValue(name);
    assert.ok(value.length > 0);
    assert.ok(DEV_GATE_MARKERS.includes(value), `${name} = "${value}" chưa có trong DEV_GATE_MARKERS của release-check.mjs`);
  });
}
