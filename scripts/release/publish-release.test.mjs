// Test của publish-release.mjs: `node --test "scripts/release/*.test.mjs"`. Chỉ chạy `--dry-run`: không gọi mạng.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { test } from "node:test";

import { contentType, main, uploadPlan } from "./publish-release.mjs";

test("file của bản tải lên trước, rồi manifest của kênh, cuối cùng dấu đã đăng của bản", () => {
  const plan = uploadPlan({
    bucket: "b",
    version: "0.2.0",
    files: ["AI Translator.app.tar.gz", "AI Translator.app.tar.gz.sig", "SHA256SUMS-macos.txt"],
    channels: ["stable", "beta"],
  });
  assert.deepEqual(
    plan.map((s) => s.key),
    [
      "b/0.2.0/AI Translator.app.tar.gz",
      "b/0.2.0/AI Translator.app.tar.gz.sig",
      "b/0.2.0/SHA256SUMS-macos.txt",
      "b/stable/latest.json",
      "b/beta/latest.json",
      "b/0.2.0/published.json",
    ],
  );
  assert.equal(plan.at(-1).type, "application/json");
  assert.equal(plan.at(-1).file, "manifests/published.json");
  assert.equal(contentType("x.exe"), "application/vnd.microsoft.portable-executable");
  assert.equal(contentType("x.tar.gz"), "application/gzip");
  assert.equal(contentType("x.dmg"), "application/x-apple-diskimage");
  assert.equal(contentType("x.bin"), "application/octet-stream");
});

/** Repo giả chỉ có tauri.conf.json với `version`, và thư mục artifact `release` như job update-signatures tạo. */
function fixture(t, version) {
  const dir = mkdtempSync(join(tmpdir(), "publish-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "src-tauri"), { recursive: true });
  writeFileSync(join(repo, "src-tauri/tauri.conf.json"), JSON.stringify({ productName: "AI Translator", version }));
  const out = join(dir, "release");
  mkdirSync(out);
  for (const name of ["AI Translator.app.tar.gz", `AI Translator_${version}_x64-setup.exe`]) {
    writeFileSync(join(out, name), "x");
    writeFileSync(join(out, `${name}.sig`), `sig ${name}`);
  }
  writeFileSync(join(out, `AI Translator_${version}_aarch64.dmg`), "dmg");
  return { repo, out };
}

test("--dry-run: in lệnh wrangler theo đúng thứ tự, manifest trỏ tới đúng URL, không gọi mạng", async (t) => {
  const { repo, out } = fixture(t, "0.1.0-beta.1");
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(line));
  const args = ["--tag", "v0.1.0-beta.1", "--dir", out, "--bucket", "rel", "--base-url", "https://cdn.example/r/", "--dry-run"];
  assert.deepEqual(await main(args, { repo }), { version: "0.1.0-beta.1", channels: ["beta"] });
  const keys = lines.filter((l) => l.startsWith("(dry-run)")).map((l) => l.split(" put ")[1].split(" --file")[0]);
  assert.deepEqual(keys, [
    "rel/0.1.0-beta.1/AI Translator.app.tar.gz",
    "rel/0.1.0-beta.1/AI Translator.app.tar.gz.sig",
    "rel/0.1.0-beta.1/AI Translator_0.1.0-beta.1_aarch64.dmg",
    "rel/0.1.0-beta.1/AI Translator_0.1.0-beta.1_x64-setup.exe",
    "rel/0.1.0-beta.1/AI Translator_0.1.0-beta.1_x64-setup.exe.sig",
    "rel/beta/latest.json",
    "rel/0.1.0-beta.1/published.json",
  ]);
  assert.match(lines.at(-1), / --cache-control no-cache$/);
  const beta = JSON.parse(readFileSync(join(out, "manifests", "beta", "latest.json"), "utf8"));
  assert.equal(beta.platforms["windows-x86_64"].url, "https://cdn.example/r/0.1.0-beta.1/AI%20Translator_0.1.0-beta.1_x64-setup.exe");
  assert.equal(beta.platforms["darwin-aarch64"].signature, "sig AI Translator.app.tar.gz");
});

test("tag lệch tauri.conf.json, thiếu tham số hay URL không https thì không đăng gì", async (t) => {
  const { repo, out } = fixture(t, "0.1.0");
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(line));
  const base = ["--dir", out, "--bucket", "rel", "--dry-run"];
  await assert.rejects(main(["--tag", "v0.1.1", ...base, "--base-url", "https://x"], { repo }), /tag v0.1.1 không khớp version 0.1.0/);
  await assert.rejects(main(["--tag", "v0.1.0", ...base, "--base-url", "http://x"], { repo }), /phải là https/);
  // Kiểm https trước mọi việc khác, kể cả đọc tauri.conf.json (repo trống ở đây).
  await assert.rejects(main(["--tag", "v0.1.0", ...base, "--base-url", "http://x"], { repo: out }), /--base-url phải là https/);
  await assert.rejects(main(["--tag", "v0.1.0", "--dir", out], { repo }), /cần --tag, --dir, --bucket, --base-url/);
  assert.deepEqual(lines, []);
});

/** `fetch` giả: `latest.json` của từng kênh (null là 404), và các bản đã có dấu `published.json`; ghi lại URL đã hỏi. */
function fakeFetch(versions, asked = [], published = []) {
  return async (url) => {
    asked.push(url);
    const marker = /\/([^/]+)\/published\.json$/.exec(url)?.[1];
    if (marker) return published.includes(marker) ? { status: 200, ok: true } : { status: 404, ok: false };
    const channel = /\/(stable|beta)\/latest\.json$/.exec(url)?.[1];
    const version = channel ? versions[channel] : null;
    if (!version) return { status: 404, ok: false };
    return { status: 200, ok: true, json: async () => ({ version }) };
  };
}

test("bản đã có trong latest.json của kênh thì không đăng lại; lần đăng đứt giữa chừng thì đăng lại được", async (t) => {
  const { repo, out } = fixture(t, "0.2.0");
  t.mock.method(console, "log", () => {});
  const base = ["--tag", "v0.2.0", "--dir", out, "--bucket", "rel", "--base-url", "https://cdn.example/r"];
  const runs = [];
  const run = (cmd) => runs.push(cmd[7]);
  await assert.rejects(main(base, { repo, fetch: fakeFetch({ stable: "0.2.0", beta: "0.2.0" }), run }), /0.2.0 đã được đăng/);
  await assert.rejects(main(base, { repo, fetch: fakeFetch({ stable: null, beta: "0.2.0" }), run }), /đã được đăng/);
  assert.deepEqual(runs, [], "không tải gì");
  // Lần trước tải được một phần file nhưng chưa ghi latest.json: kênh vẫn báo 0.1.0, nên đăng lại đủ.
  const asked = [];
  assert.deepEqual(await main(base, { repo, fetch: fakeFetch({ stable: "0.1.0", beta: "0.1.0" }, asked), run }), {
    version: "0.2.0",
    channels: ["stable", "beta"],
  });
  assert.deepEqual(asked, [
    "https://cdn.example/r/0.2.0/published.json",
    "https://cdn.example/r/stable/latest.json",
    "https://cdn.example/r/beta/latest.json",
  ]);
  assert.equal(runs.length, 8);
  assert.deepEqual(runs.slice(-3), ["rel/stable/latest.json", "rel/beta/latest.json", "rel/0.2.0/published.json"]);
  const marker = JSON.parse(readFileSync(join(out, "manifests", "published.json"), "utf8"));
  assert.deepEqual(marker, { version: "0.2.0", tag: "v0.2.0", channels: ["stable", "beta"] });
});

test("bản đã rút (latest.json về bản trước) vẫn không đăng lại được: dấu published.json còn đó (Q-A của review 07b lần 2)", async (t) => {
  const { repo, out } = fixture(t, "0.3.0");
  t.mock.method(console, "log", () => {});
  const base = ["--tag", "v0.3.0", "--dir", out, "--bucket", "rel", "--base-url", "https://cdn.example/r"];
  const runs = [];
  const fetch = fakeFetch({ stable: "0.2.0", beta: "0.2.0" }, [], ["0.3.0"]);
  await assert.rejects(main(base, { repo, fetch, run: (cmd) => runs.push(cmd[7]) }), /0.3.0 đã được đăng.*published\.json/);
  assert.deepEqual(runs, [], "không tải gì");
});

test("--dir tương đối: đường dẫn --file đưa cho wrangler phải tuyệt đối, vì `pnpm -C server exec` chạy ở server/ (lỗi pipeline 37857845056)", async (t) => {
  const { repo, out } = fixture(t, "0.4.0");
  t.mock.method(console, "log", () => {});
  // Như workflow: `--dir target/release-out` so với thư mục hiện tại. Thư mục tạm của hệ điều hành có thể nằm ổ khác với repo
  // (runner Windows: C: và D:), khi đó không có đường dẫn tương đối nào; nên đặt bản sao ngay trong thư mục hiện tại.
  const local = mkdtempSync(join(process.cwd(), ".release-test-"));
  t.after(() => rmSync(local, { recursive: true, force: true }));
  cpSync(out, local, { recursive: true });
  const dir = relative(process.cwd(), local);
  assert.equal(isAbsolute(dir), false);
  const files = [];
  const run = (cmd) => files.push(cmd[cmd.indexOf("--file") + 1]);
  const base = ["--tag", "v0.4.0", "--dir", dir, "--bucket", "rel", "--base-url", "https://cdn.example/r"];
  await main(base, { repo, fetch: fakeFetch({ stable: "0.3.0", beta: "0.3.0" }), run });
  assert.ok(files.length > 0);
  for (const file of files) assert.equal(isAbsolute(file), true, `${file} phải tuyệt đối`);
  assert.equal(files[0], resolve(local, "AI Translator.app.tar.gz"));
});
