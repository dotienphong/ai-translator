// Test bước ký công thức đọc tên trong CI (kế hoạch 06): sign-recipes-ci.mjs. Không dùng khóa thật: script ký là bản giả.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { inputErrors, main as signRecipes } from "./sign-recipes-ci.mjs";

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "sign-recipes-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("sign-recipes --check: PREVIOUS bắt buộc trừ lần đăng đầu tiên", (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, "r"));
  writeFileSync(join(dir, "r", "new.json"), "{}");
  writeFileSync(join(dir, "r", "old.json"), "{}");
  assert.match(inputErrors(dir, "r/new.json", "")[0], /PREVIOUS trống/);
  assert.deepEqual(inputErrors(dir, "r/new.json", "r/old.json"), []);
  assert.deepEqual(inputErrors(dir, "r/new.json", "", true), []);
  assert.match(inputErrors(dir, "r/new.json", "r/old.json", true)[0], /không đi cùng nhau/);
  assert.deepEqual(inputErrors(dir, "r/new.json", "../old.json"), ["PREVIOUS không được có '..'"]);
  assert.deepEqual(inputErrors(dir, "r/new.json", "r/none.json"), ["không thấy r/none.json"]);
  assert.deepEqual(inputErrors(dir, "", "r/old.json"), ["BODY trống"]);
  assert.deepEqual(inputErrors(dir, "/etc/passwd", "r/old.json"), ["BODY phải là đường dẫn tương đối trong repo"]);
});

test("sign-recipes: khóa ghi ra file 0600 ngoài repo, con không thấy biến khóa, file khóa bị xóa kể cả khi lỗi", (t) => {
  const dir = tempDir(t);
  const fakeRoot = join(dir, "repo");
  mkdirSync(join(fakeRoot, "scripts", "speaker-recipes"), { recursive: true });
  writeFileSync(join(fakeRoot, "body.json"), "{}");
  const log = join(dir, "log.json");
  // sign-recipes.mjs giả: ghi lại tham số, quyền file khóa, nội dung khóa và biến môi trường mà nó thấy.
  writeFileSync(
    join(fakeRoot, "scripts", "speaker-recipes", "sign-recipes.mjs"),
    `import { readFileSync, statSync, writeFileSync } from "node:fs";
const a = process.argv.slice(2); const opt = (n) => a[a.indexOf(n) + 1];
writeFileSync(${JSON.stringify(log)}, JSON.stringify({ key: opt("--key"),
  mode: (statSync(opt("--key")).mode & 0o777).toString(8), content: readFileSync(opt("--key"), "utf8"),
  sees: process.env.MANIFEST_SIGNING_KEY ?? null }));
writeFileSync(opt("--out"), "{}");
process.exit(Number(process.env.STUB_EXIT ?? 0));
`,
  );
  const env = { PATH: process.env.PATH, RUNNER_TEMP: dir, MANIFEST_SIGNING_KEY: '{"kid":"thử"}', BODY: "body.json" };
  assert.equal(signRecipes(env, fakeRoot), join(fakeRoot, "target", "recipes", "recipes.json"));
  const seen = JSON.parse(readFileSync(log, "utf8"));
  // Windows không có quyền kiểu POSIX (NTFS báo 666): chỉ kiểm 0600 ở nơi có.
  const posixMode = process.platform === "win32" ? seen.mode : "600";
  assert.deepEqual({ ...seen, key: undefined }, { key: undefined, mode: posixMode, content: '{"kid":"thử"}', sees: null });
  assert.equal(seen.key.startsWith(dir), true);
  assert.equal(existsSync(seen.key), false, "file khóa đã bị xóa");
  assert.throws(() => signRecipes({ ...env, STUB_EXIT: "3" }, fakeRoot), /thoát mã 3/);
  assert.equal(existsSync(JSON.parse(readFileSync(log, "utf8")).key), false, "lỗi vẫn xóa file khóa");
  assert.throws(() => signRecipes({ ...env, MANIFEST_SIGNING_KEY: "" }, fakeRoot), /chưa có secret/);
  assert.throws(() => signRecipes({ ...env, BODY: "../x" }, fakeRoot), /không được có '..'/);
  assert.throws(() => signRecipes(env, dir), /chưa có scripts\/speaker-recipes\/sign-recipes.mjs/);
});

test("sign-recipes.yml: cùng luật như sign-manifest.yml (action ghim SHA, quyền chỉ đọc, ký ở job riêng có environment release)", () => {
  const yml = readFileSync(new URL("../../.github/workflows/sign-recipes.yml", import.meta.url), "utf8");
  assert.match(yml, /permissions:\n  contents: read/);
  assert.match(yml, /\n  sign:\n(?:.*\n)*?    environment: release\n/);
  assert.match(yml, /needs: check/);
  for (const use of yml.match(/uses: \S+/g)) assert.match(use, /@[0-9a-f]{40}$/, use);
  const check = yml.split("\n  sign:\n")[0];
  assert.ok(!check.includes("secrets."), "job check không có secret");
  assert.ok(yml.includes("MANIFEST_SIGNING_KEY: ${{ secrets.MANIFEST_SIGNING_KEY }}"));
  assert.ok(!/pnpm .*install/.test(yml.split("\n  sign:\n")[1]), "job có secret không cài gói");
});
