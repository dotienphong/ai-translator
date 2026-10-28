// Test `pnpm recipes:update` và script ký công thức (kế hoạch 06). Chạy: node --test scripts/speaker-recipes/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { REPO, signRecipes, testKey, verifyRecipes } from "./lib.mjs";
import { run } from "./update-flow.mjs";
import {
  RECIPES_URL,
  SOURCE,
  allowedPath,
  bodyInfo,
  canonical,
  describeDiff,
  latestReleased,
  parseArgs,
  revertBody,
  strangers,
} from "./update-lib.mjs";

const KEY = await testKey("test-r1", "ai-translator speaker recipes test key 1");
const KEYS = [{ kid: KEY.kid, x: KEY.x }];

const app = (name, os = "macos", extra = {}) => ({ app: name, os, window_title: ["^M"], tile: { role: "AXMenuItem" }, name_from: "label", speaking: [], delay_ms: 900, ...extra });
const body = (version, apps = [app("teams")], min = "0.3.2") => ({ schema: 1, version, min_app_version: min, apps });
const pretty = (b) => `${JSON.stringify(b, null, 2)}\n`;

/** Thư mục tạm của một test, xóa khi test xong. */
const temp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mt-recipes-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test("parseArgs", () => {
  assert.deepEqual(parseArgs([]), { mode: "update" });
  assert.deepEqual(parseArgs(["--check"]), { mode: "check" });
  assert.deepEqual(parseArgs(["--revert-to", "3"]), { mode: "revert", version: 3 });
  for (const bad of [["--revert-to"], ["--revert-to", "0"], ["--revert-to", "x"], ["--check", "1"], ["--sua"], ["--revert-to", "2", "3"]]) {
    assert.throws(() => parseArgs(bad), /không hợp lệ|cần số/, bad.join(" "));
  }
});

test("URL công khai trùng hằng của app", () => {
  const rust = readFileSync(resolve(REPO, "src-tauri/src/speaker/recipes.rs"), "utf8");
  assert.ok(rust.includes(`"${RECIPES_URL}"`), "RECIPES_URL của app khác của script");
});

test("bodyInfo kiểm hình dạng", () => {
  const info = bodyInfo(JSON.stringify(body(4, [app("teams"), app("zoom")])));
  assert.equal(info.version, 4);
  assert.deepEqual(info.apps, ["teams/macos", "zoom/macos"]);
  for (const [bad, re] of [
    ["{", /không phải JSON/],
    ["[]", /đối tượng/],
    [JSON.stringify({ ...body(1), schema: 2 }), /schema 2/],
    [JSON.stringify({ ...body(1), version: 0 }), /version/],
    [JSON.stringify({ ...body(1), version: 1.5 }), /version/],
    [JSON.stringify({ ...body(1), min_app_version: "0.3" }), /min_app_version/],
    [JSON.stringify({ ...body(1), apps: {} }), /apps/],
  ]) {
    assert.throws(() => bodyInfo(bad), re, bad);
  }
});

test("describeDiff nêu phiên bản, mục thêm, bỏ, đổi; công thức rỗng là tắt từ xa", () => {
  const prev = body(1, [app("teams"), app("zoom")]);
  const next = body(2, [app("teams", "macos", { delay_ms: 700 }), app("meet_chrome")], "0.3.3");
  assert.deepEqual(describeDiff(prev, next), [
    "version: 1 → 2",
    "min_app_version: 0.3.2 → 0.3.3",
    "+ thêm meet_chrome/macos",
    "- bỏ zoom/macos",
    "~ đổi teams/macos",
  ]);
  assert.deepEqual(describeDiff(null, body(1)), ["version: (chưa có bản nào) → 1", "+ thêm teams/macos"]);
  assert.match(describeDiff(body(1), body(2, [])).join("\n"), /bộ đọc tắt từ xa/);
});

test("revertBody giữ nội dung cũ, số mới là đang phát hành + 1", () => {
  const out = JSON.parse(revertBody(pretty(body(1, [app("zoom")])), 3));
  assert.equal(out.version, 4);
  assert.deepEqual(out.apps, [app("zoom")]);
});

test("strangers: chỉ file của lượt này được phép đổi", () => {
  const ok = allowedPath(5);
  const z = (...p) => p.map((x) => ` M ${x}\0`).join("");
  assert.deepEqual(strangers(z(SOURCE, "scripts/speaker-recipes/released/body-5.json", "scripts/speaker-recipes/fixtures/new.jsonl"), ok), []);
  assert.deepEqual(strangers(z(SOURCE, "src/main.rs", "scripts/speaker-recipes/released/body-4.json"), ok), ["src/main.rs", "scripts/speaker-recipes/released/body-4.json"]);
  assert.deepEqual(strangers("", ok), []);
});

test("latestReleased lấy số lớn nhất, bỏ file lạ; thư mục rỗng thì null", (t) => {
  const dir = temp(t);
  assert.equal(latestReleased(dir), null);
  for (const n of ["body-1.json", "body-10.json", "body-2.json", "readme.md", "body-x.json"]) writeFileSync(join(dir, n), "{}");
  assert.deepEqual(latestReleased(dir), { version: 10, path: join(dir, "body-10.json") });
});

test("bộ vector trong repo đúng như script sinh ra", () => {
  const fresh = execFileSync(process.execPath, [resolve(REPO, "scripts/speaker-recipes/gen-recipe-vectors.mjs")], { encoding: "utf8" });
  assert.equal(fresh, readFileSync(resolve(REPO, "crates/speaker-ops/testdata/recipe-vectors.json"), "utf8"));
});

test("ký rồi kiểm được; chữ ký của manifest model không dùng được cho công thức, và ngược lại", async () => {
  const { CONTEXT: MODELS_CONTEXT, verifyEnvelope } = await import("../models/lib.mjs");
  const json = JSON.stringify(body(2));
  const envelope = await signRecipes(KEY.privateKey, KEY.kid, json);
  assert.equal(await verifyRecipes(envelope, KEYS), json);
  await assert.rejects(verifyRecipes({ ...envelope, body: Buffer.from(JSON.stringify(body(3))).toString("base64url") }, KEYS), /Chữ ký không đúng/);
  await assert.rejects(verifyRecipes({ ...envelope, kid: "test-r2" }, KEYS), /Không có khóa công khai/);
  const asModels = await signRecipes(KEY.privateKey, KEY.kid, json, { context: MODELS_CONTEXT });
  await assert.rejects(verifyRecipes(asModels, KEYS), /Chữ ký không đúng/);
  await assert.rejects(verifyEnvelope(envelope, KEYS), /Chữ ký không đúng/);
});

test("sign-recipes.mjs từ chối khóa trong repo, kid lạ, phần thân sai schema", async (t) => {
  const dir = temp(t);
  const bodyPath = join(dir, "body.json");
  writeFileSync(bodyPath, JSON.stringify(body(2)));
  const keyPath = join(dir, "key.jwk");
  writeFileSync(keyPath, JSON.stringify({ kty: "OKP", crv: "Ed25519", kid: "test-r1", x: KEY.x, d: "AAAA" }), { mode: 0o600 });
  const sign = (...args) => spawnSync(process.execPath, [resolve(REPO, "scripts/speaker-recipes/sign-recipes.mjs"), ...args], { encoding: "utf8" });
  const unknown = sign("--key", keyPath, "--body", bodyPath, "--out", join(dir, "out.json"));
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /không có trong khối production/);
  const inRepo = sign("--key", resolve(REPO, "package.json"), "--body", bodyPath, "--out", join(dir, "out.json"));
  assert.equal(inRepo.status, 2);
  assert.match(inRepo.stderr, /không được nằm trong repo/);
  assert.equal(sign().status, 2);
});

/** Bàn làm việc giả cho luồng đăng: repo tạm, `io` ghi lại lệnh, CI "ký" bằng khóa test. */
function bench(t, { live = null, sourceVersion = 2, released = [], dirty = [], branch = "main", signWrong = false } = {}) {
  const repo = temp(t);
  const work = join(repo, ".recipes-update");
  const releasedDir = join(repo, "scripts/speaker-recipes/released");
  mkdirSync(releasedDir, { recursive: true });
  const source = body(sourceVersion, [app("teams"), app("zoom")]);
  writeFileSync(join(repo, SOURCE), pretty(source));
  for (const v of released) writeFileSync(join(releasedDir, `body-${v}.json`), pretty(body(v, [app("teams")])));
  const calls = [];
  const state = { live: live === null ? null : live, put: null, answers: [] };
  const sign = async (text) => `${JSON.stringify(await signRecipes(KEY.privateKey, KEY.kid, text))}\n`;
  const io = {
    calls,
    run(cmd, args, opts = {}) {
      calls.push({ cmd, args, env: opts.env });
      const line = `${cmd} ${args.join(" ")}`;
      if (line === "git branch --show-current") return `${branch}\n`;
      if (cmd === "git" && args[0] === "status") return dirty.map((p) => ` M ${p}\0`).join("");
      if (cmd === "git" && args[0] === "rev-parse") return "abc123\n";
      if (cmd === "git" && args[0] === "add") state.staged = true;
      if (cmd === "git" && args[0] === "diff") return state.staged ? "scripts/speaker-recipes/recipes.json\n" : "";
      if (cmd === "gh" && args[0] === "auth") return "token\n";
      if (cmd === "gh" && args[0] === "run" && args[1] === "list") return JSON.stringify(state.runs ?? []);
      if (cmd === "gh" && args[0] === "run" && args[1] === "download") {
        const dir = args[args.indexOf("-D") + 1];
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "recipes.json"), state.signed);
        return "";
      }
      if (cmd === "pnpm" && args.includes("put")) {
        state.put = args;
        state.live = readFileSync(args[args.indexOf("--file") + 1], "utf8");
        return "";
      }
      return "";
    },
    text(url) {
      assert.ok(url.startsWith(RECIPES_URL), url);
      if (state.live === null) throw Object.assign(new Error("404"), { status: 22 });
      return state.live;
    },
    sleep() {},
  };
  // Sau `gh workflow run`, lượt chạy mới xuất hiện với headSha đúng origin/main.
  const origRun = io.run;
  io.run = function (cmd, args, opts) {
    const out = origRun.call(this, cmd, args, opts);
    if (cmd === "gh" && args[0] === "workflow") state.runs = [{ databaseId: 77, headSha: "abc123" }];
    return out;
  };
  const ctx = {
    io,
    paths: { repo, released: releasedDir, work },
    keys: KEYS,
    ask: async () => state.answers.shift() ?? "y",
  };
  return { repo, ctx, calls, state, source, sign, signWrong };
}

const liveOf = async (version) => `${JSON.stringify(await signRecipes(KEY.privateKey, KEY.kid, JSON.stringify(body(version, [app("teams")]))))}\n`;
const cmds = (calls) => calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);

test("lần đăng đầu: commit, kích CI với first_release, ký, đăng lên R2, kiểm lại; bản lưu released/body-1.json", async (t) => {
  const b = bench(t, { sourceVersion: 1 });
  b.state.signed = await b.sign(canonical(readFileSync(join(b.repo, SOURCE), "utf8")));
  assert.equal(await run({ mode: "update" }, b.ctx), 0);
  const lines = cmds(b.calls);
  assert.ok(lines.some((l) => l.startsWith("git commit -m feat(speaker): công thức đọc tên số 1")), lines.join("\n"));
  assert.ok(lines.includes("git push origin HEAD:main"));
  const dispatch = lines.find((l) => l.startsWith("gh workflow run sign-recipes.yml"));
  assert.match(dispatch, /-f body=scripts\/speaker-recipes\/recipes\.json -f first_release=true/);
  assert.ok(!dispatch.includes("previous="));
  const put = b.state.put.join(" ");
  assert.match(put, /r2 object put ai-translator-releases\/speaker\/recipes\.json --file .* --content-type application\/json --cache-control no-cache --remote/);
  assert.equal(JSON.parse(readFileSync(join(b.repo, "scripts/speaker-recipes/released/body-1.json"), "utf8")).version, 1);
  // Cổng kiểm chạy trước khi đăng: luật của app rồi bộ test của worker.
  const gates = b.calls.filter((c) => c.cmd === "cargo" && c.args[0] === "test");
  assert.equal(gates.length, 2);
  assert.equal(gates[0].env.RECIPES_BODY, join(b.repo, SOURCE));
  assert.equal(gates[0].env.RECIPES_PREVIOUS, undefined);
  assert.ok(lines.findIndex((l) => l.startsWith("cargo test --locked -p speaker-worker")) < lines.indexOf("git push origin HEAD:main"));
});

test("đã có bản đang phát hành: truyền previous, sao lưu bản cũ, đăng bản mới", async (t) => {
  const b = bench(t, { live: await liveOf(1), sourceVersion: 2, released: [1] });
  b.state.signed = await b.sign(canonical(readFileSync(join(b.repo, SOURCE), "utf8")));
  assert.equal(await run({ mode: "update" }, b.ctx), 0);
  const dispatch = cmds(b.calls).find((l) => l.startsWith("gh workflow run"));
  assert.match(dispatch, /-f previous=scripts\/speaker-recipes\/released\/body-1\.json/);
  assert.ok(!dispatch.includes("first_release"));
  assert.ok(existsSync(join(b.repo, ".recipes-update/backup/recipes-v1.json")));
  const gate = b.calls.find((c) => c.cmd === "cargo" && c.args[0] === "test");
  assert.equal(gate.env.RECIPES_PREVIOUS, join(b.repo, "scripts/speaker-recipes/released/body-1.json"));
});

test("không tăng version thì dừng trước khi đụng git hay R2", async (t) => {
  const b = bench(t, { live: await liveOf(2), sourceVersion: 2, released: [2] });
  await assert.rejects(run({ mode: "update" }, b.ctx), /tăng "version"/);
  assert.equal(b.calls.filter((c) => c.cmd === "git").length, 0);
  assert.equal(b.state.put, null);
});

test("cây làm việc có file ngoài công thức thì dừng; không ở main thì dừng", async (t) => {
  const stray = bench(t, { dirty: ["src/main.rs"] });
  await assert.rejects(run({ mode: "update" }, stray.ctx), /file ngoài công thức \(src\/main\.rs\)/);
  const feature = bench(t, { branch: "phan-biet-nguoi-noi" });
  await assert.rejects(run({ mode: "update" }, feature.ctx), /nhánh main/);
  assert.equal(stray.state.put, null);
});

test("chạy lại sau khi lượt trước đã commit: không commit lần hai, vẫn đẩy, ký và đăng", async (t) => {
  const b = bench(t, { sourceVersion: 1 });
  b.state.signed = await b.sign(canonical(readFileSync(join(b.repo, SOURCE), "utf8")));
  // Không còn gì ở vùng staged (đã commit từ lượt trước): giả lập bằng cách đặt cờ staged về false sau `git add`.
  const original = b.ctx.io.run;
  b.ctx.io.run = function (cmd, args, opts) {
    const out = original.call(this, cmd, args, opts);
    if (cmd === "git" && args[0] === "add") b.state.staged = false;
    return out;
  };
  assert.equal(await run({ mode: "update" }, b.ctx), 0);
  const lines = cmds(b.calls);
  assert.ok(!lines.some((l) => l.startsWith("git commit")));
  assert.ok(lines.includes("git push origin HEAD:main"));
  assert.ok(b.state.put, "vẫn đăng lên R2");
});

test("trả lời không thì không commit, không đăng", async (t) => {
  const b = bench(t, { sourceVersion: 1 });
  b.state.answers = ["n"];
  assert.equal(await run({ mode: "update" }, b.ctx), 0);
  const lines = cmds(b.calls);
  assert.ok(!lines.some((l) => l.startsWith("git commit") || l.startsWith("git push")));
  assert.equal(b.state.put, null);
});

test("bản CI ký không khớp công thức trong repo thì KHÔNG đăng", async (t) => {
  const b = bench(t, { sourceVersion: 1 });
  b.state.signed = await b.sign(JSON.stringify(body(1, [app("zoom")])));
  await assert.rejects(run({ mode: "update" }, b.ctx), /không khớp công thức trong repo/);
  assert.equal(b.state.put, null);
});

test("--check chỉ kiểm và chạy cổng, không đụng git hay R2", async (t) => {
  const b = bench(t, { live: await liveOf(1), sourceVersion: 2, released: [1] });
  assert.equal(await run({ mode: "check" }, b.ctx), 0);
  assert.equal(b.calls.filter((c) => c.cmd === "git" || c.cmd === "gh").length, 0);
  assert.equal(b.state.put, null);
});

test("--revert-to: nội dung cũ, số mới = đang phát hành + 1; số lớn hơn hay không có bản lưu thì dừng", async (t) => {
  const b = bench(t, { live: await liveOf(3), sourceVersion: 3, released: [1, 3] });
  b.state.signed = null;
  await assert.rejects(run({ mode: "revert", version: 3 }, b.ctx), /phải chọn số nhỏ hơn/);
  await assert.rejects(run({ mode: "revert", version: 2 }, b.ctx), /Không có .*body-2\.json/);
  // Số 1 có bản lưu: nguồn được ghi lại với version 4.
  b.state.signed = await b.sign(JSON.stringify({ ...body(1, [app("teams")]), version: 4 }));
  assert.equal(await run({ mode: "revert", version: 1 }, b.ctx), 0);
  const written = JSON.parse(readFileSync(join(b.repo, SOURCE), "utf8"));
  assert.equal(written.version, 4);
  assert.deepEqual(written.apps, [app("teams")]);
  assert.ok(existsSync(join(b.repo, "scripts/speaker-recipes/released/body-4.json")));
  assert.ok(dirname(b.state.put[b.state.put.indexOf("--file") + 1]).includes("signed"));
});
