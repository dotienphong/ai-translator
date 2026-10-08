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

test("job publish: một nhóm concurrency cho mọi tag (N-4 của review 07b lần 1); bước có token Cloudflare không cài gói", () => {
  const yml = workflows[0][1];
  const job = yml.slice(yml.indexOf("\n  publish:\n"), yml.indexOf("\n  github-release:\n"));
  assert.match(job, /\n    concurrency:\n      group: release-publish\n      cancel-in-progress: false\n/);
  const secret = steps(job).filter((s) => s.includes("secrets."));
  assert.equal(secret.length, 1);
  assert.match(secret[0], /node scripts\/release\/publish-release\.mjs/);
});

test("job build app macOS: APPLE_TEAM_ID rỗng thì build ở chế độ ký ad-hoc, có thì chế độ chặt (spec 2026-10-05)", () => {
  const step = steps(workflows[0][1]).find((s) => s.startsWith("name: Build app (Tauri không ký)"));
  assert.ok(step, "không thấy bước build app macOS");
  assert.match(step, /AI_TRANSLATOR_TEAM_ID: \$\{\{ vars\.APPLE_TEAM_ID \}\}/);
  assert.match(step, /AI_TRANSLATOR_MAC_SIGNING: \$\{\{ vars\.APPLE_TEAM_ID == '' && 'adhoc' \|\| '' \}\}/);
});

test("job ký macOS: không có chứng thư thì tóm tắt của CI ghi bản ký ad-hoc, chưa notarize", () => {
  const step = steps(workflows[0][1]).find((s) => s.startsWith("name: Ký app, notarize, .dmg"));
  assert.ok(step, "không thấy bước ký app macOS");
  assert.match(step, /if \[ "\$HAS_APPLE_CERT" != "true" \]; then[\s\S]*ký ad-hoc, chưa notarize[\s\S]*>> "\$GITHUB_STEP_SUMMARY"/);
});

test("job build app Windows: WINDOWS_SIGNER rỗng thì build ở chế độ chưa ký, có thì chế độ chặt (spec 2026-10-08)", () => {
  const step = steps(workflows[0][1]).find((s) => s.startsWith("name: Build app (chưa đóng gói)"));
  assert.ok(step, "không thấy bước build app Windows");
  assert.match(step, /AI_TRANSLATOR_SIGNER: \$\{\{ vars\.WINDOWS_SIGNER \}\}/);
  assert.match(step, /AI_TRANSLATOR_WIN_SIGNING: \$\{\{ vars\.WINDOWS_SIGNER == '' && 'unsigned' \|\| '' \}\}/);
});

test("job bộ cài Windows: có tên chủ chứng thư mà không có lệnh ký thì dừng; chưa ký thì tóm tắt của CI ghi rõ", () => {
  const step = steps(workflows[0][1]).find((s) => s.startsWith("name: Bộ cài NSIS, ký, kiểm, SHA-256"));
  assert.ok(step, "không thấy bước bộ cài Windows");
  assert.match(step, /WINDOWS_SIGNER: \$\{\{ vars\.WINDOWS_SIGNER \}\}/);
  const guard = step.indexOf('if [ -n "$WINDOWS_SIGNER" ] && [ -z "$MT_WINDOWS_SIGN_CMD" ]; then');
  assert.ok(guard >= 0, "thiếu bước chặn WINDOWS_SIGNER không có lệnh ký");
  assert.ok(guard < step.indexOf("package-windows.mjs bundle"), "phải chặn trước khi đóng gói");
  assert.match(step, /exit 1/);
  assert.match(step, /if \[ -z "\$MT_WINDOWS_SIGN_CMD" \]; then[\s\S]*Bản Windows chưa ký[\s\S]*>> "\$GITHUB_STEP_SUMMARY"/);
});
