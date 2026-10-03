// Luật chung cho mọi bước có secret của các workflow (review cuối 07a: N-1, N-2): `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflows = ["release", "sign-manifest"].map((name) => [
  name,
  readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), "utf8"),
]);

/** Các bước của mọi job, mỗi bước là đoạn YAML từ `- ` tới bước kế tiếp. */
function steps(yml) {
  return yml.split("\n      - ").slice(1);
}

test("bước có secret không cài gói: cài ở một bước riêng không có secret", () => {
  for (const [name, yml] of workflows) {
    for (const step of steps(yml).filter((s) => s.includes("secrets."))) {
      assert.doesNotMatch(step, /pnpm (-C \S+ )?install/, `${name}: ${step}`);
    }
  }
});

test("file chứa bí mật được tạo với quyền 0600 ngay từ đầu (umask 077), không chmod sau khi đã ghi", () => {
  for (const [name, yml] of workflows) {
    for (const line of yml.split("\n").filter((l) => /printf '%s' "\$[A-Z0-9_]+" >/.test(l))) {
      assert.match(line, /^\s+\(umask 077; printf '%s' "\$[A-Z0-9_]+" > "[^"]+"\)$/, `${name}: ${line}`);
    }
  }
  assert.match(workflows[0][1], /umask 077; printf '%s' "\$APPLE_API_KEY_P8"/);
});
