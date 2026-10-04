// Test của scripts/run-dev-app.sh: `open` chuyển môi trường của shell cho app, nên script phải gỡ `AI_TRANSLATOR_DEV_PRO`
// của shell trước khi đọc `.env` và trước khi mở app (spec 2026-10-04, §2.3). Chạy: `node --test scripts/run-dev-app.test.mjs`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const lines = readFileSync(fileURLToPath(new URL("./run-dev-app.sh", import.meta.url)), "utf8").split("\n");

// Số dòng đầu tiên (không tính chú thích) thỏa điều kiện, -1 nếu không có.
function lineOf(match) {
  return lines.findIndex((l) => !l.trimStart().startsWith("#") && match(l));
}

const unsetLine = lineOf((l) => l.trim() === "unset AI_TRANSLATOR_DEV_PRO");

test("script có dòng `unset AI_TRANSLATOR_DEV_PRO`", () => {
  assert.notEqual(unsetLine, -1);
});

test("`unset` đứng trước lệnh đọc `.env` (read-dev-env.sh)", () => {
  const readEnv = lineOf((l) => l.includes("read-dev-env.sh"));
  assert.notEqual(readEnv, -1);
  assert.ok(unsetLine !== -1 && unsetLine < readEnv, `unset ở dòng ${unsetLine + 1}, read-dev-env.sh ở dòng ${readEnv + 1}`);
});

test("`unset` đứng trước `open -W`", () => {
  const open = lineOf((l) => /^\s*open -W\b/.test(l));
  assert.notEqual(open, -1);
  assert.ok(unsetLine !== -1 && unsetLine < open, `unset ở dòng ${unsetLine + 1}, open -W ở dòng ${open + 1}`);
});
