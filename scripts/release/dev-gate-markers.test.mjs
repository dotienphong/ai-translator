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

// Công tắc tự gửi báo cáo lỗi của dev (spec 2026-10-17): cùng cơ chế, hằng ở diagnostics/mod.rs.
test("DEV_GATE_MARKERS có giá trị của DEV_REPORTS_ENV trong diagnostics/mod.rs", () => {
  const diagnostics = readFileSync(fileURLToPath(new URL("../../src-tauri/src/diagnostics/mod.rs", import.meta.url)), "utf8");
  const m = diagnostics.match(/pub const DEV_REPORTS_ENV: &str = "([^"]*)";/);
  assert.ok(m, 'không tìm thấy `pub const DEV_REPORTS_ENV: &str = "...";` trong src-tauri/src/diagnostics/mod.rs');
  assert.ok(DEV_GATE_MARKERS.includes(m[1]), `DEV_REPORTS_ENV = "${m[1]}" chưa có trong DEV_GATE_MARKERS của release-check.mjs`);
});

test("hằng DEV_REPORTS_ENV chỉ có ở bản debug (đứng sau cfg(debug_assertions))", () => {
  const diagnostics = readFileSync(fileURLToPath(new URL("../../src-tauri/src/diagnostics/mod.rs", import.meta.url)), "utf8");
  const lines = diagnostics.split("\n");
  const at = lines.findIndex((l) => l.startsWith("pub const DEV_REPORTS_ENV"));
  assert.ok(at > 0, "không thấy hằng DEV_REPORTS_ENV");
  assert.equal(lines[at - 1].trim(), "#[cfg(debug_assertions)]", "hằng phải nằm ngay sau #[cfg(debug_assertions)]");
});
