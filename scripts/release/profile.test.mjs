// Bản phát hành không được có `debug_assertions`: mã công tắc dev (`pro.rs`) nằm sau `cfg(debug_assertions)`, nên nếu
// profile release bật nó thì công tắc `AI_TRANSLATOR_DEV_PRO` sẽ có mặt trong bản chính thức (spec 2026-10-04, §3 lớp 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const toml = readFileSync(new URL("../../Cargo.toml", import.meta.url), "utf8");

/** Phần thân của một bảng `[tên]` cho tới bảng kế tiếp. */
function table(name) {
  const start = toml.indexOf(`[${name}]`);
  assert.notEqual(start, -1, `thiếu [${name}]`);
  const rest = toml.slice(start + name.length + 2);
  const next = rest.search(/^\[/m);
  return next === -1 ? rest : rest.slice(0, next);
}

test("profile release đặt debug-assertions = false tường minh", () => {
  assert.match(table("profile.release"), /^debug-assertions = false$/m);
});

test("không có profile nào khác của bản phát hành bật debug-assertions", () => {
  assert.doesNotMatch(toml, /debug-assertions\s*=\s*true/);
});
