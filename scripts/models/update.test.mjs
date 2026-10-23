// Test của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md mục 9).
// Chạy: node --test scripts/models/update.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { REPO, signBody, testKey } from "./lib.mjs";
import {
  ASR_RELATIVE,
  MANIFEST_URL,
  applyConfigText,
  applyUpstream,
  bumpBody,
  bumpNotice,
  buildRollbackPlan,
  buildUpdatePlan,
  checkTable,
  checkUpstream,
  contentId,
  convertInputs,
  detect,
  floorFor,
  gateAsr,
  gateMt,
  gateTable,
  isYes,
  latestBody,
  manifestUrlOf,
  mtRunName,
  nextNoticeVersion,
  parseArgs,
  planTable,
  r2Key,
  restoreUpstream,
  rollbackChanges,
  sameSignedBody,
  serializeJson,
  versionOf,
} from "./update-lib.mjs";
import { checkLiveManifest, checkSources, createIo, exec, fetchFile, fetchPublished, gitBlobId } from "./update-io.mjs";
import { ASR_FEATURES, GATE_PATHS, buildTools, checkGateInputs, runGate } from "./update-gate.mjs";
import { prepare } from "./update-prepare.mjs";
import {
  commitAndPush,
  commitRecord,
  publicMatches,
  publish,
  publishManifest,
  recordHead,
  repoStage,
  signInCi,
  uploadR2,
  verifySigned,
} from "./update-publish.mjs";

/** Thư mục tạm của một test, xóa khi test xong. */
const temp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mt-update-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const readJson = (path) => JSON.parse(readFileSync(resolve(REPO, path), "utf8"));
const SHA = (c) => c.repeat(64);
const REV = (c) => c.repeat(40);

/**
 * `io` giả: `handlers.run(cmd, args, opts)` trả stdout hay một `Error` (để ném); `handlers.text(url)` trả nội dung URL;
 * `handlers.download(url)` trả nội dung file tải về hay một `Error` (để ném). Mọi lời gọi ghi vào `calls`.
 */
function fakeIo(handlers = {}) {
  const calls = [];
  const io = {
    calls,
    run(cmd, args, opts) {
      calls.push([cmd, ...args].join(" "));
      const out = handlers.run?.(cmd, args, opts);
      if (out instanceof Error) throw out;
      return out ?? "";
    },
    succeeds(cmd, args) {
      try {
        io.run(cmd, args);
        return true;
      } catch {
        return false;
      }
    },
    text(url) {
      calls.push(`text ${url}`);
      return handlers.text(url);
    },
    json(url) {
      const body = io.text(url);
      try {
        return JSON.parse(body);
      } catch (e) {
        throw Object.assign(new Error(`${url} không trả JSON hợp lệ: ${e.message}`), { invalidJson: true });
      }
    },
    download(url, dest) {
      calls.push(`download ${url}`);
      const out = handlers.download(url);
      if (out instanceof Error) throw out;
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, out);
      return dest;
    },
    sleep() {},
  };
  return io;
}

const hfEntry = {
  source: "hf-file",
  repo: "org/m-GGUF",
  path: "m-Q8_0.gguf",
  revision: REV("a"),
  content: `sha256:${SHA("1")}`,
  license: "apache-2.0",
  gate: { kind: "mt" },
};
const hfApi = ({ license = "apache-2.0", sha = SHA("1"), readme = "r1", extra = [] } = {}) => ({
  sha: REV("b"),
  cardData: { license },
  siblings: [
    { rfilename: ".gitattributes", blobId: "g1" },
    { rfilename: "README.md", blobId: readme },
    { rfilename: "m-Q8_0.gguf", blobId: "x1", size: 10, lfs: { sha256: sha, size: 10 } },
    ...extra,
  ],
});
const convertEntry = {
  source: "hf-convert",
  repo: "org/m",
  revision: REV("a"),
  inputs: { "config.json": "blob:c1", "model.safetensors": `sha256:${SHA("3")}` },
  license: "apache-2.0",
  gate: { kind: "mt" },
};
const convertApi = (config = "c1", extra = []) => ({
  sha: REV("c"),
  cardData: { license: "apache-2.0" },
  siblings: [
    { rfilename: ".gitattributes", blobId: "g1" },
    { rfilename: "README.md", blobId: "r9" },
    { rfilename: "config.json", blobId: config },
    { rfilename: "model.safetensors", blobId: "s1", lfs: { sha256: SHA("3"), size: 5 } },
    ...extra,
  ],
});
const ghEntry = {
  source: "github-release",
  repo: "org/vad",
  path: "src/vad.onnx",
  revision: "v6.2.3",
  content: `sha256:${SHA("4")}`,
  license: "MIT",
  gate: { kind: "report" },
};

test("parseArgs đọc đúng bốn chế độ và từ chối tham số lạ", () => {
  assert.deepEqual(parseArgs([]), { mode: "update" });
  assert.deepEqual(parseArgs(["--check"]), { mode: "check" });
  assert.deepEqual(parseArgs(["--gate-only", "hy-mt2-1.8b-q8_0"]), { mode: "gate-only", id: "hy-mt2-1.8b-q8_0" });
  assert.deepEqual(parseArgs(["--rollback-to", "3"]), { mode: "rollback", sequence: 3 });
  for (const bad of [["--check", "x"], ["--gate-only"], ["--rollback-to", "0"], ["--rollback-to", "3a"], ["--khac"], ["--gate-only", "--check"]]) {
    assert.throws(() => parseArgs(bad), /Tham số không hợp lệ|--rollback-to cần/, bad.join(" "));
  }
});

test("latestBody lấy body-<n>.json có số lớn nhất", (t) => {
  const dir = temp(t);
  for (const name of ["body-1.json", "body-2.json", "body-10.json", "khac.json", "body-x.json"]) {
    writeFileSync(join(dir, name), "{}");
  }
  assert.deepEqual(latestBody(dir), { sequence: 10, path: join(dir, "body-10.json") });
  assert.throws(() => latestBody(temp(t)), /Không có body/);
});

test("contentId và convertInputs", () => {
  assert.equal(contentId({ rfilename: "a", blobId: "b1" }), "blob:b1");
  assert.equal(contentId({ rfilename: "a", blobId: "b1", lfs: { sha256: SHA("9") } }), `sha256:${SHA("9")}`);
  assert.deepEqual(convertInputs(convertApi().siblings), {
    "config.json": "blob:c1",
    "model.safetensors": `sha256:${SHA("3")}`,
  });
});

test("detect hf-file: chỉ đổi README thì không tính; đổi file thì có bản mới; mất file hay đổi giấy phép thì dừng", () => {
  assert.deepEqual(detect("m", hfEntry, { api: hfApi() }), { id: "m", status: "same" });
  assert.deepEqual(detect("m", hfEntry, { api: hfApi({ readme: "r2" }) }), { id: "m", status: "same" });
  assert.deepEqual(detect("m", hfEntry, { api: hfApi({ sha: SHA("2") }) }), {
    id: "m",
    status: "new",
    next: { revision: REV("b"), content: `sha256:${SHA("2")}`, size: 10 },
  });
  const gone = { ...hfApi(), siblings: hfApi().siblings.filter((s) => s.rfilename !== "m-Q8_0.gguf") };
  assert.equal(detect("m", hfEntry, { api: gone }).status, "stop");
  const relicensed = detect("m", hfEntry, { api: hfApi({ license: "other" }) });
  assert.equal(relicensed.status, "stop");
  assert.match(relicensed.reason, /giấy phép/);
});

test("detect: gate.kind report chỉ báo với cả nguồn Hugging Face; bản đã bị quay lại thì bỏ qua", () => {
  const reported = detect("m", { ...hfEntry, gate: { kind: "report" } }, { api: hfApi({ sha: SHA("2") }) });
  assert.equal(reported.status, "report");
  assert.match(reported.reason, /có bbbbbbb, đang dùng aaaaaaa; đổi bằng tay/);
  assert.deepEqual(reported.next, { revision: REV("b"), content: `sha256:${SHA("2")}`, size: 10 });
  const rejectedEntry = { ...hfEntry, rejected: [{ sequence: 4, content: `sha256:${SHA("2")}` }] };
  const skipped = detect("m", rejectedEntry, { api: hfApi({ sha: SHA("2") }) });
  assert.equal(skipped.status, "skip");
  assert.match(skipped.reason, /đã bị quay lại ở manifest số 4; xóa khỏi rejected trong upstream\.json nếu muốn đăng lại/);
  assert.equal(detect("m", rejectedEntry, { api: hfApi({ sha: SHA("7") }) }).status, "new");
  const ghRejected = { ...ghEntry, gate: { kind: "none" }, rejected: [{ sequence: 5, content: `sha256:${SHA("5")}` }] };
  assert.equal(detect("v", ghRejected, { tag: "v7", license: "MIT", content: `sha256:${SHA("5")}` }).status, "skip");
});

test("detect hf-convert: đầu vào trùng bản đã bị quay lại thì bỏ qua", () => {
  const inputs = { "config.json": "blob:c2", "model.safetensors": `sha256:${SHA("3")}` };
  const entry = { ...convertEntry, rejected: [{ sequence: 6, inputs }] };
  const skipped = detect("l", entry, { api: convertApi("c2") });
  assert.equal(skipped.status, "skip");
  assert.match(skipped.reason, /manifest số 6/);
  assert.equal(detect("l", entry, { api: convertApi("c3") }).status, "new");
});

test("convertInputs bỏ qua tài liệu, giấy phép, ảnh; file khác thì tính", () => {
  const skip = [
    { rfilename: "LICENSE", blobId: "l1" },
    { rfilename: "LICENSE.txt", blobId: "l2" },
    { rfilename: "NOTICE", blobId: "n1" },
    { rfilename: "docs/README.rst", blobId: "r1" },
    { rfilename: "imgs/logo.png", blobId: "p1" },
    { rfilename: "a.JPG", blobId: "p2" },
    { rfilename: "b.svg", blobId: "p3" },
  ];
  assert.deepEqual(convertInputs([...convertApi().siblings, ...skip]), convertInputs(convertApi().siblings));
  assert.equal(detect("l", convertEntry, { api: convertApi("c1", skip) }).status, "same");
  const added = detect("l", convertEntry, { api: convertApi("c1", [...skip, { rfilename: "tokenizer.json", blobId: "t1" }]) });
  assert.equal(added.status, "new");
  assert.equal(convertInputs([{ rfilename: "licensed-model.bin", blobId: "z" }])["licensed-model.bin"], "blob:z");
});

test("detect hf-convert: so mọi file đầu vào trừ tài liệu", () => {
  assert.deepEqual(detect("l", convertEntry, { api: convertApi() }), { id: "l", status: "same" });
  const changed = detect("l", convertEntry, { api: convertApi("c2") });
  assert.equal(changed.status, "new");
  assert.deepEqual(changed.next, {
    revision: REV("c"),
    inputs: { "config.json": "blob:c2", "model.safetensors": `sha256:${SHA("3")}` },
  });
  const added = detect("l", convertEntry, { api: convertApi("c1", [{ rfilename: "tokenizer.json", blobId: "t1" }]) });
  assert.equal(added.status, "new");
  const docs = detect("l", convertEntry, { api: convertApi("c1", [{ rfilename: "docs/notes.md", blobId: "n1" }]) });
  assert.equal(docs.status, "same");
});

test("detect github-release: VAD mới chỉ báo; cùng nội dung thì không tính; đổi giấy phép thì dừng", () => {
  assert.deepEqual(detect("v", ghEntry, { tag: "v6.2.3", license: "MIT", content: null }), { id: "v", status: "same" });
  assert.deepEqual(detect("v", ghEntry, { tag: "v6.3.0", license: "MIT", content: `sha256:${SHA("4")}` }), {
    id: "v",
    status: "same",
  });
  const report = detect("v", ghEntry, { tag: "v6.3.0", license: "MIT", content: `sha256:${SHA("5")}` });
  assert.equal(report.status, "report");
  assert.deepEqual(report.next, { revision: "v6.3.0", content: `sha256:${SHA("5")}` });
  assert.equal(detect("v", ghEntry, { tag: "v6.2.3", license: "Apache-2.0", content: null }).status, "stop");
  const gated = { ...ghEntry, gate: { kind: "none" } };
  assert.equal(detect("v", gated, { tag: "v7", license: "MIT", content: `sha256:${SHA("5")}` }).status, "new");
});

test("upstream.json trong repo khớp models.config.json và manifest mới nhất", () => {
  const upstream = readJson("scripts/models/upstream.json");
  const config = readJson("scripts/models/models.config.json");
  const body = readJson(latestBody(resolve(REPO, "scripts/models/released")).path);
  assert.deepEqual(checkUpstream(upstream, config, body), []);
  const broken = structuredClone(upstream);
  broken.entries["hy-mt2-1.8b-q8_0"].content = `sha256:${SHA("0")}`;
  broken.entries["khong-co"] = { ...broken.entries["hy-mt2-license"] };
  delete broken.entries["whisper-small-q5_1"].gate.baseline;
  broken.entries["lmt-60-0.6b-q8_0"].gate.prompt = "hy-mt2";
  const problems = checkUpstream(broken, config, body);
  assert.ok(problems.some((p) => p.startsWith("hy-mt2-1.8b-q8_0: content khác")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("khong-co: không có trong models.config.json")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("whisper-small-q5_1: thiếu gate.baseline")), problems.join("\n"));
  assert.ok(
    problems.some((p) => p === "lmt-60-0.6b-q8_0: gate.prompt khác prompt của models.config.json"),
    problems.join("\n"),
  );
});

test("mọi gate.baseline của upstream.json có file trên đĩa", () => {
  const upstream = readJson("scripts/models/upstream.json");
  for (const [id, e] of Object.entries(upstream.entries)) {
    for (const baseline of [e.gate.baseline, ...e.history.map((h) => h.baseline)].filter(Boolean)) {
      assert.ok(existsSync(resolve(REPO, baseline)), `${id}: không có file ${baseline}`);
    }
  }
});

test("MANIFEST_URL trùng PRODUCTION_URL của app", () => {
  const source = readFileSync(resolve(REPO, "src-tauri/src/models/source.rs"), "utf8");
  assert.equal(/PRODUCTION_URL: Option<&str> = Some\("([^"]+)"\)/.exec(source)?.[1], MANIFEST_URL);
});

test("sameSignedBody so phần thân đã ký với dạng gọn của file", () => {
  const text = `${JSON.stringify({ schema: 1, sequence: 4 }, null, 2)}\n`;
  const envelope = { body: Buffer.from(JSON.stringify({ schema: 1, sequence: 4 })).toString("base64url") };
  assert.equal(sameSignedBody(envelope, text), true);
  assert.equal(sameSignedBody(envelope, text.replace("4", "5")), false);
});

test("checkTable: dòng DỪNG không có bản mới thì cột mới nhất là ?; có dòng bỏ qua", () => {
  const upstream = { entries: { a: hfEntry, b: hfEntry } };
  const table = checkTable(
    [
      { id: "a", status: "stop", reason: "mất file" },
      { id: "b", status: "skip", reason: "đã quay lại", next: { revision: REV("c") } },
    ],
    upstream,
  );
  assert.match(table, /\| a \| org\/m-GGUF \| aaaaaaa \| \? \| DỪNG: mất file \|/);
  assert.match(table, /\| b \| org\/m-GGUF \| aaaaaaa \| ccccccc \| bỏ qua: đã quay lại \|/);
});

test("checkTable in một dòng mỗi mục", () => {
  const upstream = { entries: { a: hfEntry, v: ghEntry } };
  const table = checkTable(
    [
      { id: "a", status: "new", next: { revision: REV("b") } },
      { id: "v", status: "report", reason: "đổi bằng tay", next: { revision: "v6.3.0" } },
    ],
    upstream,
  );
  assert.match(table, /\| a \| org\/m-GGUF \| aaaaaaa \| bbbbbbb \| CÓ BẢN MỚI \|/);
  assert.match(table, /\| v \| org\/vad \| v6\.2\.3 \| v6\.3\.0 \| có bản mới \(chỉ báo\): đổi bằng tay \|/);
});

test("checkSources: mỗi repo Hugging Face đọc một lần; file GitHub chỉ tải khi tag khác", async (t) => {
  const work = temp(t);
  const io = fakeIo({
    text(url) {
      if (url.startsWith("https://huggingface.co/api/models/org/m-GGUF/")) return JSON.stringify(hfApi());
      if (url === "https://api.github.com/repos/org/vad/releases/latest") return JSON.stringify({ tag_name: "v7" });
      if (url === "https://api.github.com/repos/org/vad") return JSON.stringify({ license: { spdx_id: "MIT" } });
      throw new Error(`URL lạ ${url}`);
    },
    download: () => "vad mới",
  });
  const upstream = { entries: { a: hfEntry, b: { ...hfEntry, path: "m-Q4.gguf" }, v: ghEntry } };
  const results = await checkSources(io, upstream, work);
  assert.deepEqual(
    results.map((r) => [r.id, r.status]),
    [
      ["a", "same"],
      ["b", "stop"],
      ["v", "report"],
    ],
  );
  assert.equal(io.calls.filter((c) => c.startsWith("text https://huggingface.co/api/")).length, 1);
  assert.ok(io.calls.includes("download https://raw.githubusercontent.com/org/vad/v7/src/vad.onnx"));
  const sameTag = await checkSources(io, { entries: { v: { ...ghEntry, revision: "v7" } } }, work);
  assert.equal(sameTag[0].status, "same");
  assert.equal(io.calls.filter((c) => c.startsWith("download ")).length, 1, "tag trùng thì không tải");
  assert.equal(existsSync(join(work, "check", "v", "scratch")), false, "file tải để băm bị xóa sau khi băm");
});

test("checkSources: một nguồn đọc lỗi thành dòng DỪNG, các mục khác vẫn được kiểm", async (t) => {
  const io = fakeIo({
    text(url) {
      if (url.includes("/org/m-GGUF/")) throw new Error("mạng đứt");
      if (url.includes("/org/m/")) return JSON.stringify(convertApi());
      throw new Error(`URL lạ ${url}`);
    },
  });
  const results = await checkSources(io, { entries: { a: hfEntry, l: convertEntry } }, temp(t));
  assert.deepEqual(
    results.map((r) => [r.id, r.status]),
    [
      ["a", "stop"],
      ["l", "same"],
    ],
  );
  assert.match(results[0].reason, /^không đọc được nguồn: mạng đứt/);
});

test("fetchFile tải vào .part rồi mới đổi tên; file đã có thì không tải lại", (t) => {
  const dir = temp(t);
  const io = fakeIo({ download: () => "abc" });
  const dest = join(dir, "x", "f.bin");
  assert.equal(fetchFile(io, "https://e/f.bin", dest), dest);
  assert.equal(readFileSync(dest, "utf8"), "abc");
  assert.equal(io.calls.at(-1), "download https://e/f.bin");
  fetchFile(io, "https://e/f.bin", dest);
  assert.equal(io.calls.length, 1);
});

test("fetchFile: lỗi curl 33 hay 36 thì xóa .part và tải lại; lỗi khác thì giữ .part và ném tiếp", (t) => {
  const dir = temp(t);
  const failure = (status) => Object.assign(new Error(`curl thoát mã ${status}`), { status });
  const dest = join(dir, "f.bin");
  for (const status of [33, 36]) {
    rmSync(dest, { force: true });
    writeFileSync(`${dest}.part`, "dở");
    let first = true;
    const io = fakeIo({
      download() {
        if (!first) return "đủ";
        first = false;
        return failure(status);
      },
    });
    assert.equal(fetchFile(io, "https://e/f.bin", dest), dest);
    assert.equal(readFileSync(dest, "utf8"), "đủ");
    assert.equal(existsSync(`${dest}.part`), false);
    assert.equal(io.calls.length, 2);
  }
  rmSync(dest, { force: true });
  writeFileSync(`${dest}.part`, "dở");
  const io = fakeIo({ download: () => failure(56) });
  assert.throws(() => fetchFile(io, "https://e/f.bin", dest), /thoát mã 56/);
  assert.equal(readFileSync(`${dest}.part`, "utf8"), "dở", "lỗi khác: giữ .part để lần sau tải tiếp");
  assert.equal(io.calls.length, 1);
});

test("exec ném lỗi có status; bị tín hiệu giết thì ghi rõ tín hiệu", () => {
  assert.equal(exec(process.execPath, ["-e", "process.stdout.write('ok')"]), "ok");
  assert.throws(
    () => exec(process.execPath, ["-e", "process.exit(3)"]),
    (e) => e.status === 3 && e.signal === null && /thoát mã 3/.test(e.message),
  );
  assert.throws(
    () => exec(process.execPath, ["-e", "process.kill(process.pid, 'SIGKILL')"]),
    (e) => e.status === null && e.signal === "SIGKILL" && /bị dừng bởi tín hiệu SIGKILL/.test(e.message),
  );
  assert.deepEqual(exec(process.execPath, ["-e", "process.exit(2)"], { ok: [2] }), "");
});

test("createIo: curl có hạn chờ; JSON hỏng thì lỗi nêu URL", () => {
  const seen = [];
  const io = createIo((cmd, args) => {
    seen.push([cmd, ...args]);
    return args.at(-1).includes("hong") ? "<html>" : '{"a":1}';
  });
  assert.deepEqual(io.json("https://e/tot"), { a: 1 });
  assert.deepEqual(seen[0].slice(0, 7), ["curl", "-fsSL", "--retry", "2", "--connect-timeout", "20", "--max-time"]);
  assert.equal(seen[0][7], "120");
  assert.throws(() => io.json("https://e/hong"), /^Error: https:\/\/e\/hong không trả JSON hợp lệ: /);
  io.download("https://e/f", "/tmp/x/f.part");
  const args = seen.at(-1).join(" ");
  assert.match(args, /--connect-timeout 20 --speed-limit 1024 --speed-time 60/);
  assert.doesNotMatch(args, /--max-time/);
  assert.match(args, /-C -/);
});

test("gitBlobId trùng git hash-object (kể cả CRLF)", (t) => {
  const dir = temp(t);
  const known = join(dir, "hello.txt");
  writeFileSync(known, "hello\n");
  assert.equal(gitBlobId(known), "ce013625030ba8dba906f756967f9e9ca394464a");
  const crlf = join(dir, "crlf.txt");
  writeFileSync(crlf, "dòng 1\r\ndòng 2\r\n");
  const expected = execFileSync("git", ["hash-object", "--no-filters", crlf], { cwd: dir, encoding: "utf8" }).trim();
  assert.equal(gitBlobId(crlf), expected);
});

test("checkLiveManifest: manifest đang chạy phải là body mới nhất, ký bằng khóa tin cậy", async (t) => {
  const dir = temp(t);
  const bodyText = `${JSON.stringify({ schema: 1, sequence: 3, files: [] }, null, 2)}\n`;
  writeFileSync(join(dir, "body-3.json"), bodyText);
  const key = await testKey("test-u1", "ai-translator update test key 1");
  const keys = [{ kid: key.kid, x: key.x }];
  const live = (body) => fakeIo({ text: () => JSON.stringify(body) });
  const signed = await signBody(key.privateKey, key.kid, JSON.stringify(JSON.parse(bodyText)));
  assert.deepEqual(await checkLiveManifest(live(signed), dir, keys), { sequence: 3, path: join(dir, "body-3.json") });
  const older = await signBody(key.privateKey, key.kid, JSON.stringify({ schema: 1, sequence: 2, files: [] }));
  await assert.rejects(checkLiveManifest(live(older), dir, keys), /lệch nhau/);
  const other = await testKey("test-u2", "ai-translator update test key 2");
  const foreign = await signBody(other.privateKey, other.kid, JSON.stringify(JSON.parse(bodyText)));
  await assert.rejects(checkLiveManifest(live(foreign), dir, keys), /Không có khóa công khai/);
  const tampered = { ...signed, sig: `${signed.sig[0] === "A" ? "B" : "A"}${signed.sig.slice(1)}` };
  await assert.rejects(checkLiveManifest(live(tampered), dir, keys), /Chữ ký không đúng/);
  await assert.rejects(checkLiveManifest(live({ ...signed, format: "khac" }), dir, keys), /format/);
  await assert.rejects(checkLiveManifest(live({ ...signed, version: 2 }), dir, keys), /version/);
  const offline = fakeIo({
    text() {
      throw new Error("curl thoát mã 6");
    },
  });
  await assert.rejects(checkLiveManifest(offline, dir, keys), /curl thoát mã 6[\s\S]*dig @8\.8\.8\.8 releases\.aitranslator\.io\.vn/);
});

test("checkLiveManifest: body-N.json phải có sequence đúng N", async (t) => {
  const dir = temp(t);
  const bodyText = `${JSON.stringify({ schema: 1, sequence: 2, files: [] }, null, 2)}\n`;
  writeFileSync(join(dir, "body-3.json"), bodyText);
  const key = await testKey("test-u3", "ai-translator update test key 3");
  const signed = await signBody(key.privateKey, key.kid, JSON.stringify(JSON.parse(bodyText)));
  const io = fakeIo({ text: () => JSON.stringify(signed) });
  await assert.rejects(checkLiveManifest(io, dir, [{ kid: key.kid, x: key.x }]), /body-3\.json.*sequence/);
});

const dirResult = (comet, extra = {}) => ({ n: 100, comet, failed: 0, leaked: 0, ...extra });
const Q8 = "Hy-MT2-1.8B-Q8_0-plain";

test("gateMt: thụt lùi quá 0,01, dưới mức sàn, chấm thiếu câu, nhiều câu lỗi hơn đều không đạt", () => {
  const base = { [Q8]: { "en->vi": dirResult(0.842), "vi->en": dirResult(0.821) } };
  const ok = gateMt({ [Q8]: { "en->vi": dirResult(0.835), "vi->en": dirResult(0.83) } }, base, Q8);
  assert.equal(ok.pass, true, ok.problems.join());
  assert.equal(ok.rows.length, 2);
  const worse = gateMt({ [Q8]: { "en->vi": dirResult(0.84), "vi->en": dirResult(0.805) } }, base, Q8);
  assert.equal(worse.pass, false);
  assert.match(worse.problems.join("\n"), /vi->en: COMET 0\.805 thấp hơn mốc 0\.821/);
  const lowBase = { [Q8]: { "en->vi": dirResult(0.832), "vi->en": dirResult(0.821) } };
  const floor = gateMt({ [Q8]: { "en->vi": dirResult(0.829), "vi->en": dirResult(0.83) } }, lowBase, Q8);
  assert.match(floor.problems.join("\n"), /en->vi 0\.829 dưới mức sàn 0\.83/);
  const fewer = gateMt({ [Q8]: { "en->vi": dirResult(0.85, { n: 90 }), "vi->en": dirResult(0.83) } }, base, Q8);
  assert.match(fewer.problems.join("\n"), /chỉ chấm 90\/100 câu/);
  const errors = gateMt({ [Q8]: { "en->vi": dirResult(0.85, { failed: 1 }), "vi->en": dirResult(0.83) } }, base, Q8);
  assert.match(errors.problems.join("\n"), /số câu lỗi 1 nhiều hơn mốc 0/);
  assert.equal(gateMt({}, base, Q8).pass, false);
  const noComet = gateMt({ [Q8]: { "vi->en": dirResult(0.83) } }, { [Q8]: { "vi->en": dirResult(0.821) } }, Q8);
  assert.deepEqual(noComet.problems, ["en->vi: không có COMET (mức sàn 0.83)"]);
});

test("floorFor, mtRunName theo đúng luật của score_mt.py", () => {
  assert.equal(floorFor("LMT-60-0.6B-Q8_0-plain"), 0.77);
  assert.equal(floorFor(Q8), 0.83);
  assert.equal(floorFor("Hy-MT2-1.8B-Q4_K_M-plain"), 0.8);
  assert.equal(floorFor("khac-plain"), null);
  assert.equal(mtRunName("/a/b/Hy-MT2-1.8B-Q8_0.gguf"), Q8);
});

test("gateAsr: mỗi nhóm không xấu hơn mốc quá 10% tương đối", () => {
  const base = { "en-wb": { n: 102, wer: 0.054 }, "zh-wb": { n: 90, cer: 0.05 } };
  assert.equal(gateAsr({ "en-wb": { wer: 0.059 }, "zh-wb": { cer: 0.055 } }, base).pass, true);
  const worse = gateAsr({ "en-wb": { wer: 0.06 }, "zh-wb": { cer: 0.05 } }, base);
  assert.equal(worse.pass, false);
  assert.match(worse.problems.join(), /en-wb: WER 0\.060 xấu hơn mốc 0\.054/);
  assert.equal(gateAsr({ "en-wb": { wer: 0.05 } }, base).pass, false, "thiếu nhóm");
  assert.equal(ASR_RELATIVE, 0.1);
});

test("cổng kiểm trên mốc thật: model đang phát hành so với chính nó thì đạt", () => {
  const gd1 = readJson("bench/phase0/results/s7_mt-gd1-a3.json").runs;
  assert.equal(gateMt(gd1, gd1, Q8).pass, true);
  assert.equal(gateMt(gd1, gd1, "Hy-MT2-1.8B-Q4_K_M-plain").pass, true);
  const fast = readJson("bench/phase0/results/s7_mt-goi-nhanh.json").runs;
  assert.equal(gateMt(fast, fast, "LMT-60-0.6B-Q8_0-plain").pass, true);
  for (const name of ["a4_m4pro-turbo-final.json", "a4_m4pro-small-final.json"]) {
    const a4 = readJson(`bench/phase0/results/${name}`);
    assert.equal(gateAsr(a4, a4).pass, true, name);
  }
});

test("gateTable in bảng và kết luận", () => {
  const mt = gateMt({ [Q8]: { "en->vi": dirResult(0.85) } }, { [Q8]: { "en->vi": dirResult(0.842) } }, Q8);
  assert.match(gateTable(mt, "mt"), /\| en->vi \| 0\.842 \| 0\.850 \| \+0\.008 \| đạt \|/);
  assert.match(gateTable(mt, "mt"), /Cổng kiểm: ĐẠT\./);
  assert.match(gateTable({ pass: false, rows: [], problems: ["kết quả không có lượt x"] }, "mt"), /\| Chiều \| Mốc \|/);
  assert.match(gateTable({ pass: false, rows: [], problems: ["thiếu"] }, "asr"), /\| Nhóm \| Mốc \|/);
  const asr = gateAsr({ "en-wb": { wer: 0.07 } }, { "en-wb": { wer: 0.054 } });
  assert.match(gateTable(asr, "asr"), /\| en-wb \(WER\) \| 0\.054 \| 0\.070 \| XẤU HƠN \|/);
  assert.match(gateTable(asr, "asr"), /Cổng kiểm: KHÔNG ĐẠT\./);
});

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

test("prepare hf-file: tải theo revision mới, kiểm SHA-256 với nguồn", async (t) => {
  const work = temp(t);
  const io = fakeIo({ download: () => "model mới" });
  const next = { revision: REV("b"), content: `sha256:${sha256("model mới")}` };
  assert.deepEqual(await prepare(io, work, "m", hfEntry, next, "m-Q8_0.gguf"), {
    path: join(work, "m", REV("b"), "m-Q8_0.gguf"),
    bytes: Buffer.byteLength("model mới"),
    sha256: sha256("model mới"),
  });
  assert.ok(io.calls.includes(`download https://huggingface.co/org/m-GGUF/resolve/${REV("b")}/m-Q8_0.gguf`));
  const wrong = { revision: REV("c"), content: `sha256:${SHA("9")}` };
  await assert.rejects(prepare(io, work, "m", hfEntry, wrong, "m-Q8_0.gguf"), /không khớp nguồn.*đã xóa, chạy lại để tải lại/);
  assert.equal(existsSync(join(work, "m", REV("c"), "m-Q8_0.gguf")), false, "file sai bị xóa");
});

test("prepare file thường (giấy phép): so mã blob git tự tính, kể cả file xuống dòng CRLF", async (t) => {
  const work = temp(t);
  const text = "Apache License\r\nVersion 2.0\r\n";
  const blob = createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
  const io = fakeIo({ download: () => text });
  const entry = { ...hfEntry, path: "LICENSE.txt" };
  const got = await prepare(io, work, "lic", entry, { revision: REV("b"), content: `blob:${blob}` }, "L.txt");
  assert.equal(got.sha256, sha256(text));
  assert.ok(!io.calls.some((c) => c.startsWith("git ")), "không gọi git");
  await assert.rejects(prepare(io, work, "lic", entry, { revision: REV("c"), content: "blob:b2" }, "L.txt"), /không khớp nguồn/);
});

test("prepare github-release: tải file ở tag mới", async (t) => {
  const work = temp(t);
  const io = fakeIo({ download: () => "onnx" });
  await prepare(io, work, "v", ghEntry, { revision: "v7", content: `sha256:${sha256("onnx")}` }, "vad.onnx");
  assert.ok(io.calls.includes("download https://raw.githubusercontent.com/org/vad/v7/src/vad.onnx"));
});

const convertTool = { llama_tag: "b1", llama_commit: REV("d"), outtype: "q8_0", python: "3.12" };

/** `io` giả cho bước chuyển: `outputs` là nội dung lần chuyển thứ nhất và thứ hai. */
function convertIo(outputs) {
  let round = 0;
  return fakeIo({
    run(cmd, args) {
      if (cmd === "git" && args[0] === "clone") mkdirSync(args.at(-1), { recursive: true });
      if (cmd === "git" && args.includes("rev-parse")) return `${REV("d")}\n`;
      if (cmd === "uv" && args[0] === "venv") {
        mkdirSync(join(args[3], "bin"), { recursive: true });
        writeFileSync(join(args[3], "bin", "python"), "");
      }
      if (cmd === "uv" && args[1] === "freeze") return "torch==2.11.0\n";
      if (args.includes("--outfile")) writeFileSync(args[args.indexOf("--outfile") + 1], outputs[round++]);
      return "";
    },
  });
}

test("prepare hf-convert: chuyển hai lần ra cùng SHA-256 thì dùng, ghi môi trường chuyển", async (t) => {
  const work = temp(t);
  const io = convertIo(["gguf", "gguf"]);
  const entry = { ...convertEntry, convert: convertTool };
  const got = await prepare(io, work, "l", entry, { revision: REV("c"), inputs: {} }, "L-Q8_0.gguf");
  assert.equal(got.sha256, sha256("gguf"));
  assert.equal(existsSync(`${got.path}.lan-2`), false, "bỏ bản chuyển lần hai");
  assert.equal(readFileSync(join(work, "l", REV("c"), "convert-env.txt"), "utf8"), "torch==2.11.0\n");
  assert.ok(io.calls.some((c) => c.startsWith("git clone --depth 1 --branch b1 https://github.com/ggml-org/llama.cpp")));
  assert.ok(io.calls.some((c) => c.includes(`snapshot_download("org/m", revision="${REV("c")}"`)));
});

test("prepare hf-convert: hai lần chuyển khác nhau thì dừng; llama.cpp sai commit thì dừng", async (t) => {
  const entry = { ...convertEntry, convert: convertTool };
  await assert.rejects(
    prepare(convertIo(["a", "b"]), temp(t), "l", entry, { revision: REV("c"), inputs: {} }, "L.gguf"),
    /hai SHA-256 khác nhau/,
  );
  const wrongCommit = { ...entry, convert: { ...convertTool, llama_commit: REV("e") } };
  await assert.rejects(
    prepare(convertIo(["a", "a"]), temp(t), "l", wrongCommit, { revision: REV("c"), inputs: {} }, "L.gguf"),
    /^Error: llama\.cpp tag b1 ở .* là commit d{40}, upstream\.json ghi eeeeeee\. Nếu vừa clone lại mà vẫn khác thì tag ở GitHub đã bị dời: sửa convert trong upstream\.json sau khi kiểm\.$/,
  );
});

test("fetchPublished tải file đang phát hành qua tên miền công khai và kiểm SHA-256", async (t) => {
  const work = temp(t);
  const file = { id: "m", file: "m.gguf", url: "hy-mt2/m.gguf", sha256: sha256("cũ") };
  const io = fakeIo({ download: () => "cũ" });
  const path = await fetchPublished(io, work, file);
  assert.equal(readFileSync(path, "utf8"), "cũ");
  assert.ok(io.calls.includes("download https://releases.aitranslator.io.vn/models/hy-mt2/m.gguf"));
  const bad = fakeIo({ download: () => "khác" });
  await assert.rejects(fetchPublished(bad, temp(t), file), /manifest ghi/);
});

/** Thoát ký tự đặc biệt của chuỗi (đường dẫn thư mục tạm) để đưa vào RegExp. */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Đường dẫn cổng kiểm trong thư mục tạm; `latency-bench` là "lb", `asr-worker` là "aw". */
function gatePaths(root) {
  const paths = {
    repo: root,
    results: join(root, "results"),
    mtOutputs: join(root, "mt"),
    mtTestset: join(root, "mt", "testset.jsonl"),
    asrData: join(root, "asr"),
    llamaServer: join(root, "llama-server"),
    latencyBench: "lb",
    asrWorker: "aw",
  };
  for (const dir of [paths.results, paths.mtOutputs, paths.asrData]) mkdirSync(dir, { recursive: true });
  return paths;
}

test("runGate dịch: chạy thử trước, chấm, so mốc, chuyển kết quả ra khỏi bench/phase0/results", (t) => {
  const root = temp(t);
  const paths = gatePaths(root);
  const runs = (comet) => JSON.stringify({ runs: { "m-Q8_0-plain": { "en->vi": { n: 2, comet, failed: 0, leaked: 0 } } } });
  writeFileSync(join(root, "base.json"), runs(0.85));
  const io = fakeIo({
    run(cmd) {
      if (cmd === "uv") {
        writeFileSync(join(paths.results, "s7_mt-nhan.json"), runs(0.86));
        writeFileSync(join(paths.results, "s7_mt-nhan.md"), "bảng");
      }
      return "";
    },
  });
  const entry = { gate: { kind: "mt", prompt: "hy-mt2", baseline: "base.json" } };
  const out = join(root, "out");
  const gate = runGate(io, entry, "/x/m-Q8_0.gguf", "nhan", out, paths);
  assert.equal(gate.pass, true, gate.problems.join());
  assert.equal(gate.result, join(out, "s7_mt-nhan.json"));
  assert.ok(existsSync(join(out, "s7_mt-nhan.md")) && existsSync(join(out, "gate.md")));
  assert.equal(existsSync(join(paths.results, "s7_mt-nhan.json")), false);
  assert.match(io.calls[0], /^lb mt-eval .*--prompt hy-mt2 .*--limit 2$/);
  assert.match(io.calls[1], new RegExp(`^lb mt-eval .*--out-dir ${escapeRegExp(join(paths.mtOutputs, "outputs-nhan"))}$`));
  assert.match(io.calls[2], /^uv run --no-project --python 3\.12 .*unbabel-comet==2\.2\.7.* python bench\/phase0\/mt\/score_mt\.py --outputs .* --label nhan$/);
});

test("runGate: model không chạy được bằng engine của app thì báo cần nâng engine", (t) => {
  const root = temp(t);
  const io = fakeIo({ run: (cmd, args) => (args.includes("--limit") ? new Error("llama-server thoát mã 1") : "") });
  const entry = { gate: { kind: "mt", prompt: "hy-mt2", baseline: "base.json" } };
  const paths = gatePaths(root);
  const out = join(root, "out");
  assert.throws(
    () => runGate(io, entry, "/x/m.gguf", "nhan", out, paths),
    (e) => {
      assert.match(e.message, /^Model không chạy được bằng llama-server của app \(thường do model cần llama\.cpp\/whisper\.cpp mới hơn bản đóng trong app; không đăng\)\. Xem log /);
      assert.ok(e.message.includes(`${join(out, "chay-thu", "m.llama.log")}. Lỗi: llama-server thoát mã 1`), e.message);
      return true;
    },
  );
});

test("runGate nhận dạng: chạy thử trên vài clip, chấm, so mốc", (t) => {
  const root = temp(t);
  const paths = gatePaths(root);
  writeFileSync(join(paths.asrData, "manifest.jsonl"), '{"id":"a"}\n{"id":"b"}\n{"id":"c"}\n');
  writeFileSync(join(root, "a4-base.json"), JSON.stringify({ "en-wb": { n: 3, wer: 0.05 } }));
  const io = fakeIo({
    run(cmd) {
      if (cmd === "uv") writeFileSync(join(paths.results, "a4_nhan.json"), JSON.stringify({ "en-wb": { n: 3, wer: 0.06 } }));
      return "";
    },
  });
  const entry = { gate: { kind: "asr", baseline: "a4-base.json" } };
  const gate = runGate(io, entry, "/x/ggml.bin", "nhan", join(root, "out"), paths);
  assert.equal(gate.pass, false, "0,06 xấu hơn 0,05 quá 10%");
  assert.equal(readFileSync(join(paths.asrData, "manifest-chay-thu.jsonl"), "utf8"), '{"id":"a"}\n{"id":"b"}\n');
  assert.match(io.calls[0], /^lb asr-eval --manifest .*manifest-chay-thu\.jsonl --asr-worker aw --asr-model \/x\/ggml\.bin/);
  assert.match(io.calls[2], /score_asr\.py .*out-nhan\.jsonl$/);
});

test("checkUpstream: rejected phải là mảng, mỗi phần tử có sequence nguyên và đúng một trong content, inputs", () => {
  const upstream = readJson("scripts/models/upstream.json");
  const config = readJson("scripts/models/models.config.json");
  const body = readJson(latestBody(resolve(REPO, "scripts/models/released")).path);
  const id = "hy-mt2-1.8b-q8_0";
  const withRejected = (rejected) => {
    const copy = structuredClone(upstream);
    copy.entries[id].rejected = rejected;
    return checkUpstream(copy, config, body);
  };
  assert.deepEqual(withRejected([{ sequence: 2, content: `sha256:${SHA("5")}` }, { sequence: 3, inputs: { "a.bin": "blob:1" } }]), []);
  for (const bad of [
    "không phải mảng",
    [{ content: `sha256:${SHA("5")}` }],
    [{ sequence: 1.5, content: "x" }],
    [{ sequence: 2 }],
    [{ sequence: 2, content: "x", inputs: {} }],
    [{ sequence: 2, content: 7 }],
    [{ sequence: 2, content: "x" }],
    [{ sequence: 2, content: "md5:abc" }],
    [{ sequence: 2, inputs: "x" }],
    [{ sequence: 2, inputs: [] }],
    [null],
  ]) {
    const problems = withRejected(bad);
    assert.ok(problems.some((p) => p.startsWith(`${id}: rejected`) && p.endsWith("sai dạng")), `${JSON.stringify(bad)}: ${problems.join()}`);
  }
  assert.ok(withRejected([{ sequence: 2, content: `blob:${SHA("1")}` }, { sequence: 2 }]).includes(`${id}: rejected[1] sai dạng`));
});

test("checkLiveManifest: nội dung không phải JSON thì lỗi nêu URL, không kèm gợi ý DNS; lỗi mạng vẫn kèm gợi ý DNS", async (t) => {
  const dir = temp(t);
  writeFileSync(join(dir, "body-1.json"), `${JSON.stringify({ schema: 1, sequence: 1, files: [] })}\n`);
  const html = createIo(() => "<html>");
  await assert.rejects(checkLiveManifest(html, dir, []), (e) => {
    assert.ok(e.message.includes(`${MANIFEST_URL}?t=`) && e.message.includes("không trả JSON hợp lệ"), e.message);
    assert.ok(!e.message.includes("dig @8.8.8.8"), e.message);
    return true;
  });
  const offline = createIo(() => {
    throw new Error("curl thoát mã 6");
  });
  await assert.rejects(checkLiveManifest(offline, dir, []), /curl thoát mã 6[\s\S]*dig @8\.8\.8\.8/);
});

test("prepare hf-convert: môi trường Python theo tag llama.cpp; cài lại khi chưa có dấu .cai-xong, có rồi thì bỏ qua", async (t) => {
  const entry = { ...convertEntry, convert: convertTool };
  const next = { revision: REV("c"), inputs: {} };
  const installs = (io) => io.calls.filter((c) => c.startsWith("uv pip install"));
  // Lần đầu: dựng venv-<tag>, cài, rồi mới ghi dấu.
  const work = temp(t);
  const first = convertIo(["g", "g"]);
  await prepare(first, work, "l", entry, next, "L.gguf");
  const venv = join(work, "convert", "venv-b1");
  assert.equal(installs(first).length, 1);
  assert.ok(existsSync(join(venv, ".cai-xong")), "ghi dấu sau khi cài xong");
  // Có python nhưng chưa có dấu (lần cài trước dở): phải cài lại, không dựng lại venv.
  const half = temp(t);
  mkdirSync(join(half, "convert", "venv-b1", "bin"), { recursive: true });
  writeFileSync(join(half, "convert", "venv-b1", "bin", "python"), "");
  const second = convertIo(["g", "g"]);
  await prepare(second, half, "l", entry, next, "L.gguf");
  assert.equal(installs(second).length, 1);
  assert.ok(!second.calls.some((c) => c.startsWith("uv venv")));
  assert.ok(existsSync(join(half, "convert", "venv-b1", ".cai-xong")));
  // Đã có dấu: bỏ qua cả dựng lẫn cài.
  const again = convertIo(["g", "g"]);
  await prepare(again, work, "l2", entry, next, "L.gguf");
  assert.equal(installs(again).length, 0);
  // Cài hỏng thì không có dấu.
  const broken = temp(t);
  const failing = fakeIo({
    run(cmd, args) {
      if (cmd === "git" && args[0] === "clone") mkdirSync(args.at(-1), { recursive: true });
      if (cmd === "git" && args.includes("rev-parse")) return `${REV("d")}\n`;
      if (cmd === "uv" && args[0] === "venv") {
        mkdirSync(join(args[3], "bin"), { recursive: true });
        writeFileSync(join(args[3], "bin", "python"), "");
      }
      if (cmd === "uv" && args[1] === "install") return new Error("uv pip install thoát mã 1");
      return "";
    },
  });
  await assert.rejects(prepare(failing, broken, "l", entry, next, "L.gguf"), /uv pip install/);
  assert.equal(existsSync(join(broken, "convert", "venv-b1", ".cai-xong")), false);
});

/** Bộ dựng cho test chạy lại cổng dịch: `io` giả với trạng thái git và meta của lượt dịch cũ. */
function mtRig(t, { meta, head = "aaa", dirty = "" }) {
  const root = temp(t);
  const paths = gatePaths(root);
  const out = join(root, "out");
  const outputs = join(paths.mtOutputs, "outputs-nhan");
  const metaFile = join(outputs, "m-Q8_0-plain.meta.json");
  const model = join(root, "m-Q8_0.gguf");
  writeFileSync(model, "abcd");
  if (meta) {
    mkdirSync(outputs, { recursive: true });
    writeFileSync(metaFile, JSON.stringify({ llama_server: paths.llamaServer, model_bytes: 4, ...meta }));
    writeFileSync(join(outputs, "m-Q8_0-plain.jsonl"), "{}\n");
  }
  const runs = JSON.stringify({ runs: { "m-Q8_0-plain": { "en->vi": { n: 2, comet: 0.86, failed: 0, leaked: 0 } } } });
  writeFileSync(join(root, "base.json"), runs);
  const seen = { gitCwd: [] };
  mkdirSync(join(out, "chay-thu"), { recursive: true });
  writeFileSync(join(out, "chay-thu", "cu.txt"), "kết quả chạy thử cũ");
  const io = fakeIo({
    run(cmd, args, opts) {
      if (cmd === "git") {
        seen.gitCwd.push(opts?.cwd);
        return args[0] === "rev-parse" ? `${head}\n` : dirty;
      }
      if (cmd === "lb" && args.includes("--limit")) seen.smokeSawOld = existsSync(join(out, "chay-thu", "cu.txt"));
      if (cmd === "lb" && !args.includes("--limit")) seen.fullSawOutputs = existsSync(outputs);
      if (cmd === "uv") writeFileSync(join(paths.results, "s7_mt-nhan.json"), runs);
      return "";
    },
  });
  const entry = { gate: { kind: "mt", prompt: "hy-mt2", baseline: "base.json" } };
  const run = () => runGate(io, entry, model, "nhan", out, paths);
  return { io, seen, run, outputs, metaFile, root };
}

test("runGate dịch: xóa thư mục chạy thử cũ trước khi chạy thử", (t) => {
  const rig = mtRig(t, {});
  rig.run();
  assert.equal(rig.seen.smokeSawOld, false);
});

test("runGate dịch: kết quả dịch cũ khác git HEAD hay git_dirty thì xóa, dịch lại từ đầu", (t) => {
  for (const meta of [
    { git_head: "bbb", git_dirty: false },
    { git_head: "aaa", git_dirty: true },
  ]) {
    const rig = mtRig(t, { meta });
    rig.run();
    assert.equal(rig.seen.fullSawOutputs, false, JSON.stringify(meta));
    assert.ok(rig.seen.gitCwd.length === 2 && rig.seen.gitCwd.every((c) => c === rig.root), "git chạy trong repo của cổng kiểm");
  }
  const dirty = mtRig(t, { meta: { git_head: "aaa", git_dirty: false }, dirty: " M crates/x.rs\n" });
  dirty.run();
  assert.equal(dirty.seen.fullSawOutputs, false, "cây làm việc đang sửa dở mà meta ghi sạch");
});

test("runGate dịch: kết quả dịch cũ làm bằng llama-server khác hay model khác dung lượng thì xóa, dịch lại từ đầu", (t) => {
  for (const meta of [
    { git_head: "aaa", git_dirty: false, llama_server: "/bản/khác/llama-server" },
    { git_head: "aaa", git_dirty: false, model_bytes: 5 },
  ]) {
    const rig = mtRig(t, { meta });
    rig.run();
    assert.equal(rig.seen.fullSawOutputs, false, JSON.stringify(meta));
  }
});

test("runGate dịch: cùng trạng thái code thì giữ kết quả cũ để dịch tiếp; không có meta cũng không gọi git", (t) => {
  const same = mtRig(t, { meta: { git_head: "aaa", git_dirty: false } });
  same.run();
  assert.equal(same.seen.fullSawOutputs, true);
  assert.ok(existsSync(same.metaFile));
  const none = mtRig(t, {});
  none.run();
  assert.deepEqual(none.seen.gitCwd, []);
});

test("runGate: gate.kind lạ thì báo lỗi", (t) => {
  const root = temp(t);
  assert.throws(() => runGate(fakeIo(), { gate: { kind: "none" } }, "/x/m.gguf", "nhan", join(root, "out"), gatePaths(root)), /^Error: gate\.kind lạ none$/);
});

test("runGate nhận dạng: xóa kết quả và log chạy thử cũ; lỗi engine chỉ tới log của lượt chạy thử", (t) => {
  const root = temp(t);
  const paths = gatePaths(root);
  const out = join(root, "out");
  writeFileSync(join(paths.asrData, "manifest.jsonl"), '{"id":"a"}\n{"id":"b"}\n');
  mkdirSync(join(paths.asrData, "logs"), { recursive: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "chay-thu.jsonl"), "{}\n");
  writeFileSync(join(paths.asrData, "logs", "chay-thu.log"), "log cũ");
  const seen = {};
  const io = fakeIo({
    run(cmd, args) {
      if (cmd === "lb") {
        seen.jsonl = existsSync(join(out, "chay-thu.jsonl"));
        seen.log = existsSync(join(paths.asrData, "logs", "chay-thu.log"));
        return new Error("asr-worker thoát mã 1");
      }
      return "";
    },
  });
  const entry = { gate: { kind: "asr", baseline: "a4-base.json" } };
  assert.throws(
    () => runGate(io, entry, "/x/ggml.bin", "nhan", out, paths),
    (e) => {
      assert.match(e.message, /^Model không chạy được bằng asr-worker của app \(thường do model cần llama\.cpp\/whisper\.cpp mới hơn/);
      assert.ok(e.message.includes(`Xem log ${join(paths.asrData, "logs", "chay-thu.log")}. Lỗi: asr-worker thoát mã 1`), e.message);
      return true;
    },
  );
  assert.deepEqual(seen, { jsonl: false, log: false });
});

test("cổng kiểm khớp scripts/copy-sidecars.sh: cùng llama-server và cùng features của asr-worker", (t) => {
  const script = readFileSync(resolve(REPO, "scripts/copy-sidecars.sh"), "utf8");
  const llamaDir = /^llama_dir="\$root\/([^"]+)"$/m.exec(script)?.[1];
  assert.ok(llamaDir, "không đọc được llama_dir");
  assert.ok(GATE_PATHS.llamaServer.endsWith(`${llamaDir}/llama-server`), GATE_PATHS.llamaServer);
  const features = /cargo build --release -p asr-worker --features (\S+?)\)/.exec(script)?.[1];
  assert.equal(features, ASR_FEATURES);
  const root = temp(t);
  const paths = gatePaths(root);
  writeFileSync(paths.llamaServer, "");
  writeFileSync(paths.mtTestset, "");
  writeFileSync(join(paths.asrData, "manifest.jsonl"), "");
  const io = fakeIo();
  buildTools(io, paths);
  assert.deepEqual(io.calls, [
    "cargo build --release --locked -p latency-bench",
    `cargo build --release --locked -p asr-worker --features ${features}`,
  ]);
});

test("checkGateInputs: thiếu llama-server, bộ thử dịch hay manifest nhận dạng thì báo trước khi tải gì", (t) => {
  const paths = gatePaths(temp(t));
  assert.throws(() => checkGateInputs(paths), /^Error: Thiếu .*llama-server/);
  writeFileSync(paths.llamaServer, "");
  assert.throws(() => checkGateInputs(paths), /Thiếu .*testset\.jsonl/);
  writeFileSync(paths.mtTestset, "");
  assert.throws(() => checkGateInputs(paths), /Thiếu .*manifest\.jsonl/);
  writeFileSync(join(paths.asrData, "manifest.jsonl"), "");
  checkGateInputs(paths);
});

const body3 = () => readJson("scripts/models/released/body-3.json");
const Q8_ID = "hy-mt2-1.8b-q8_0";

test("r2Key, manifestUrlOf, versionOf", () => {
  const key = r2Key("hy-mt2", REV("b"), "Hy-MT2-1.8B-Q8_0.gguf");
  assert.equal(key, "models/hy-mt2/bbbbbbbbbbbb/Hy-MT2-1.8B-Q8_0.gguf");
  assert.equal(manifestUrlOf(key), "hy-mt2/bbbbbbbbbbbb/Hy-MT2-1.8B-Q8_0.gguf");
  assert.equal(versionOf({ version_prefix: "whisper.cpp-" }, REV("b")), "whisper.cpp-bbbbbbb");
  assert.equal(versionOf({ version_prefix: "" }, "v6.3.0"), "v6.3.0");
});

test("bumpBody thay đúng mục, tăng số, giữ phần còn lại", () => {
  const prev = body3();
  const q8 = prev.files.find((f) => f.id === Q8_ID);
  const next = bumpBody(prev, { [Q8_ID]: { ...q8, version: "x", sha256: SHA("7") } }, "2026-10-24T00:00:00Z");
  assert.equal(next.sequence, 4);
  assert.equal(next.published_at, "2026-10-24T00:00:00Z");
  assert.deepEqual(Object.keys(next), Object.keys(prev), "giữ thứ tự khóa");
  const changed = next.files.filter((f, i) => JSON.stringify(f) !== JSON.stringify(prev.files[i]));
  assert.deepEqual(changed.map((f) => f.id), [Q8_ID]);
  assert.deepEqual(next.packs, prev.packs);
  assert.throws(() => bumpBody(prev, { khong: {} }, "t"), /không có mục khong/);
});

test("rollbackChanges chỉ lấy lại phần nội dung; giữ tier, giữ mục thêm sau; mục đã bỏ thì dừng", () => {
  const prev = body3();
  const q8 = prev.files.find((f) => f.id === Q8_ID);
  const current = bumpBody(prev, { [Q8_ID]: { ...q8, version: "x", url: "hy-mt2/x/f", sha256: SHA("7"), bytes: 1 } }, "t");
  const changes = rollbackChanges(current, prev);
  assert.deepEqual(changes, { [Q8_ID]: q8 });
  const body2 = readJson("scripts/models/released/body-2.json");
  assert.deepEqual(rollbackChanges(prev, body2), {}, "số 2 và số 3 chỉ khác tier, không có gì để quay lại");
  const retiered = structuredClone(current);
  retiered.files.find((f) => f.id === Q8_ID).tier = ["standard", "moi"];
  assert.deepEqual(rollbackChanges(retiered, prev)[Q8_ID].tier, ["standard", "moi"], "tier giữ như bản đang chạy");
  const dropped = structuredClone(prev);
  dropped.files = dropped.files.filter((f) => f.id !== "notice");
  assert.throws(() => rollbackChanges(dropped, prev), /mục đã bỏ: notice/);
});

test("bumpNotice thay revision của đúng repo trong NOTICE", () => {
  const notice = readFileSync(resolve(REPO, "scripts/models/NOTICE.txt"), "utf8");
  const next = bumpNotice(notice, "tencent/Hy-MT2-1.8B-GGUF", REV("b"));
  assert.match(next, new RegExp(`https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF \\(revision ${REV("b")}\\)`));
  assert.match(next, /ggerganov\/whisper\.cpp \(revision 5359861c739e955e79d9a303bcbc70fb988958b1\)/, "whisper giữ nguyên");
  assert.throws(() => bumpNotice(notice, "org/khac", REV("b")), /NOTICE không có dòng/);
  assert.equal(nextNoticeVersion("1"), "2");
  assert.throws(() => nextNoticeVersion("x"), /version/);
});

test("applyConfigText chỉ sửa đúng dòng của mục trong models.config.json", () => {
  const text = readFileSync(resolve(REPO, "scripts/models/models.config.json"), "utf8");
  const next = applyConfigText(text, Q8_ID, { version: "9f3c2a1", url: "hy-mt2/9f3c2a1b4d5e/Hy-MT2-1.8B-Q8_0.gguf" });
  const [a, b] = [text.split("\n"), next.split("\n")];
  assert.equal(a.length, b.length);
  assert.equal(a.filter((line, i) => line !== b[i]).length, 1);
  const entry = JSON.parse(next).files.find((f) => f.id === Q8_ID);
  assert.equal(entry.version, "9f3c2a1");
  assert.equal(entry.url, "hy-mt2/9f3c2a1b4d5e/Hy-MT2-1.8B-Q8_0.gguf");
  assert.throws(() => applyConfigText(text, "khong", { version: "1", url: "u" }), /không có dòng của khong/);
});

test("applyUpstream thêm dòng history; restoreUpstream lấy lại đúng bản cũ", () => {
  const upstream = readJson("scripts/models/upstream.json");
  const next = { revision: REV("b"), content: `sha256:${SHA("7")}` };
  const up4 = applyUpstream(upstream, Q8_ID, next, 4, "bench/model-updates/x/s7_mt-x.json");
  const e4 = up4.entries[Q8_ID];
  assert.equal(e4.revision, REV("b"));
  assert.equal(e4.content, `sha256:${SHA("7")}`);
  assert.equal(e4.gate.baseline, "bench/model-updates/x/s7_mt-x.json");
  assert.deepEqual(e4.history.at(-1), { sequence: 4, revision: REV("b"), content: `sha256:${SHA("7")}`, baseline: "bench/model-updates/x/s7_mt-x.json" });
  assert.equal(upstream.entries[Q8_ID].revision, "a0c709d9fac510f2c807aa3af52872340dc37a4a", "không sửa bản gốc");
  const up5 = restoreUpstream(up4, Q8_ID, 3, 5);
  const e5 = up5.entries[Q8_ID];
  assert.equal(e5.revision, "a0c709d9fac510f2c807aa3af52872340dc37a4a");
  assert.equal(e5.gate.baseline, "bench/phase0/results/s7_mt-gd1-a3.json");
  assert.equal(e5.history.length, 3);
  assert.equal(e5.history.at(-1).sequence, 5);
  assert.deepEqual(e5.rejected, [{ sequence: 5, content: `sha256:${SHA("7")}` }], "bản vừa gỡ vào rejected");
  assert.equal(detect(Q8_ID, e5, { api: { sha: REV("b"), cardData: { license: "apache-2.0" }, siblings: [{ rfilename: "Hy-MT2-1.8B-Q8_0.gguf", lfs: { sha256: SHA("7") } }] } }).status, "skip");
  assert.throws(() => restoreUpstream(upstream, "lmt-60-0.6b-q8_0", 2, 5), /không có bản nào/);
  const license = applyUpstream(upstream, "hy-mt2-license", { revision: REV("b"), content: "blob:b9" }, 4, null);
  assert.equal(license.entries["hy-mt2-license"].history.at(-1).baseline, undefined, "mục không có cổng kiểm thì không ghi mốc");
});

test("isYes chỉ nhận y hay Y", () => {
  for (const yes of ["y", "Y", " y "]) assert.equal(isYes(yes), true, yes);
  for (const no of ["", "n", "yes", "có", undefined]) assert.equal(isYes(no), false, String(no));
});

/** Kế hoạch đăng bản Q8_0 mới (revision REV("b")) trên dữ liệu thật của repo. */
function q8Plan() {
  const upstream = readJson("scripts/models/upstream.json");
  const notice = readFileSync(resolve(REPO, "scripts/models/NOTICE.txt"), "utf8");
  const noticeFast = readFileSync(resolve(REPO, "scripts/models/NOTICE-fast.txt"), "utf8");
  const plan = buildUpdatePlan({
    body: body3(),
    upstream,
    configText: readFileSync(resolve(REPO, "scripts/models/models.config.json"), "utf8"),
    noticeTexts: { notice, "notice-fast": noticeFast },
    prepared: [
      {
        id: Q8_ID,
        entry: upstream.entries[Q8_ID],
        next: { revision: REV("b"), content: `sha256:${SHA("7")}` },
        local: { path: "/w/q8.gguf", bytes: 123, sha256: SHA("7") },
        bench: { from: "/w/gate", to: "bench/model-updates/2026-10-24-q8" },
        baseline: "bench/model-updates/2026-10-24-q8/s7_mt-x.json",
      },
    ],
    publishedAt: "2026-10-24T00:00:00Z",
    repo: "/repo",
  });
  return { plan, notice, upstream };
}

test("buildUpdatePlan: mục model mới, NOTICE mới, các file trong repo, lời commit", () => {
  const { plan, notice } = q8Plan();
  assert.equal(plan.kind, "update");
  assert.equal(plan.base, 3);
  assert.equal(plan.target, 4);
  assert.deepEqual(Object.keys(plan.replace).sort(), [Q8_ID, "notice"]);
  const q8 = plan.replace[Q8_ID];
  assert.equal(q8.url, "hy-mt2/bbbbbbbbbbbb/Hy-MT2-1.8B-Q8_0.gguf");
  assert.equal(q8.version, "bbbbbbb");
  assert.equal(q8.sha256, SHA("7"));
  assert.equal(q8.file, "Hy-MT2-1.8B-Q8_0.gguf", "giữ tên file");
  const n = plan.replace.notice;
  assert.equal(n.version, "2");
  assert.match(n.url, /^notice\/2-[0-9a-f]{8}\/NOTICE\.txt$/);
  const newNotice = plan.files["scripts/models/NOTICE.txt"];
  assert.notEqual(newNotice, notice);
  assert.equal(n.sha256, createHash("sha256").update(newNotice).digest("hex"));
  assert.deepEqual(plan.uploads.map((u) => u.path), ["/w/q8.gguf", "/repo/scripts/models/NOTICE.txt"]);
  assert.deepEqual(Object.keys(plan.files).sort(), [
    "scripts/models/NOTICE.txt",
    "scripts/models/models.config.json",
    "scripts/models/released/body-4.json",
    "scripts/models/upstream.json",
  ]);
  const body4 = JSON.parse(plan.files[plan.bodyRel]);
  assert.equal(body4.sequence, 4);
  assert.deepEqual(body4.files.find((f) => f.id === Q8_ID), q8);
  assert.equal(JSON.parse(plan.files["scripts/models/upstream.json"]).entries[Q8_ID].gate.baseline, "bench/model-updates/2026-10-24-q8/s7_mt-x.json");
  assert.equal(plan.prevRel, "scripts/models/released/body-3.json");
  assert.deepEqual(plan.bench, [{ from: "/w/gate", to: "bench/model-updates/2026-10-24-q8" }]);
  assert.equal(plan.message, "chore(models): hy-mt2-1.8b-q8_0 lên bbbbbbb (manifest số 4)");
});

test("buildUpdatePlan: bản chuẩn bị trùng file đang phát hành thì không đăng, chỉ ghi nhận revision", () => {
  const upstream = readJson("scripts/models/upstream.json");
  const lmt = "lmt-60-0.6b-q8_0";
  const published = body3().files.find((f) => f.id === lmt);
  const same = {
    id: lmt,
    entry: upstream.entries[lmt],
    next: { revision: REV("c"), inputs: { "config.json": "blob:c9" } },
    local: { path: "/w/lmt.gguf", bytes: published.bytes, sha256: published.sha256 },
    unchanged: true,
    bench: null,
    baseline: null,
  };
  const args = {
    body: body3(),
    upstream,
    configText: readFileSync(resolve(REPO, "scripts/models/models.config.json"), "utf8"),
    noticeTexts: {
      notice: readFileSync(resolve(REPO, "scripts/models/NOTICE.txt"), "utf8"),
      "notice-fast": readFileSync(resolve(REPO, "scripts/models/NOTICE-fast.txt"), "utf8"),
    },
    publishedAt: "t",
    repo: "/repo",
  };
  const record = buildUpdatePlan({ ...args, prepared: [same] });
  assert.equal(record.kind, "record");
  assert.deepEqual(Object.keys(record.files), ["scripts/models/upstream.json"]);
  const recorded = JSON.parse(record.files["scripts/models/upstream.json"]).entries[lmt];
  assert.equal(recorded.revision, REV("c"));
  assert.equal(recorded.history.at(-1).sequence, 3);
  assert.match(record.message, /^chore\(models\): ghi nhận revision mới của nguồn, nội dung không đổi \(lmt-60-0\.6b-q8_0 lên ccccccc\)$/);
  const { plan: q8 } = q8Plan();
  const mixed = buildUpdatePlan({ ...args, prepared: [same, { ...q8PreparedItem(upstream) }] });
  assert.equal(mixed.kind, "update");
  assert.deepEqual(Object.keys(mixed.replace).sort(), [Q8_ID, "notice"], "không thay mục LMT, không đụng NOTICE-fast");
  assert.equal(JSON.parse(mixed.files["scripts/models/upstream.json"]).entries[lmt].revision, REV("c"));
  assert.equal(mixed.message, q8.message);
});

/** Mục Q8_0 đã chuẩn bị, như trong `q8Plan`. */
function q8PreparedItem(upstream) {
  return {
    id: Q8_ID,
    entry: upstream.entries[Q8_ID],
    next: { revision: REV("b"), content: `sha256:${SHA("7")}` },
    local: { path: "/w/q8.gguf", bytes: 123, sha256: SHA("7") },
    bench: { from: "/w/gate", to: "bench/model-updates/2026-10-24-q8" },
    baseline: "bench/model-updates/2026-10-24-q8/s7_mt-x.json",
  };
}

test("buildUpdatePlan dừng khi NOTICE trong repo khác bản đang phát hành", () => {
  const upstream = readJson("scripts/models/upstream.json");
  assert.throws(
    () =>
      buildUpdatePlan({
        body: body3(),
        upstream,
        configText: readFileSync(resolve(REPO, "scripts/models/models.config.json"), "utf8"),
        noticeTexts: { notice: "khác", "notice-fast": "khác" },
        prepared: [
          {
            id: Q8_ID,
            entry: upstream.entries[Q8_ID],
            next: { revision: REV("b"), content: `sha256:${SHA("7")}` },
            local: { path: "/w/q8.gguf", bytes: 1, sha256: SHA("7") },
            bench: null,
            baseline: null,
          },
        ],
        publishedAt: "t",
        repo: "/repo",
      }),
    /NOTICE\.txt trong repo khác bản đang phát hành/,
  );
});

test("buildRollbackPlan quay về số 3 từ số 4: lấy lại mục và NOTICE cũ, upstream.json về bản cũ", () => {
  const { plan, notice } = q8Plan();
  const current = JSON.parse(plan.files[plan.bodyRel]);
  const rollback = buildRollbackPlan({
    current,
    target: body3(),
    upstream: JSON.parse(plan.files["scripts/models/upstream.json"]),
    configText: plan.files["scripts/models/models.config.json"],
    noticeTexts: { notice },
    publishedAt: "2026-10-25T00:00:00Z",
  });
  assert.equal(rollback.kind, "rollback");
  assert.equal(rollback.base, 4);
  assert.equal(rollback.target, 5);
  const old = new Map(body3().files.map((f) => [f.id, f]));
  assert.deepEqual(rollback.replace[Q8_ID], old.get(Q8_ID));
  assert.deepEqual(rollback.replace.notice, old.get("notice"));
  assert.equal(rollback.files["scripts/models/NOTICE.txt"], notice);
  assert.deepEqual(rollback.uploads, []);
  const up = JSON.parse(rollback.files["scripts/models/upstream.json"]);
  assert.equal(up.entries[Q8_ID].revision, "a0c709d9fac510f2c807aa3af52872340dc37a4a");
  const config = JSON.parse(rollback.files["scripts/models/models.config.json"]);
  assert.equal(config.files.find((f) => f.id === Q8_ID).url, "hy-mt2/Hy-MT2-1.8B-Q8_0.gguf");
  assert.equal(rollback.message, "chore(models): quay lại model như manifest số 3 (manifest số 5)");
  assert.equal(buildRollbackPlan({ current: body3(), target: readJson("scripts/models/released/body-2.json"), upstream: readJson("scripts/models/upstream.json"), configText: "{}", noticeTexts: {}, publishedAt: "t" }), null);
});

test("planTable in mỗi mục một dòng", () => {
  const { plan } = q8Plan();
  const table = planTable(plan, body3());
  assert.match(table, /^Manifest số 3 → số 4\./);
  assert.match(table, /\| hy-mt2-1\.8b-q8_0 \| a0c709d, 5c3fe0b1408a, 1820\.1 MB \| bbbbbbb, 777777777777, 0\.0 MB \| hy-mt2\/bbbbbbbbbbbb\/Hy-MT2-1\.8B-Q8_0\.gguf \|/);
});

test("uploadR2: chưa có thì tải lên rồi kiểm lại; đã có cùng nội dung thì bỏ qua; khác nội dung thì dừng", async (t) => {
  const dir = temp(t);
  const scratch = join(dir, "scratch");
  const file = join(dir, "f.gguf");
  writeFileSync(file, "noi dung");
  const u = { key: "models/hy-mt2/bbbbbbbbbbbb/f.gguf", path: file, sha256: sha256("noi dung") };
  let uploaded = false;
  const io = fakeIo({
    run(cmd) {
      if (cmd === "curl") return uploaded ? "200" : "404";
      if (cmd === "rclone") uploaded = true;
      return "";
    },
    download: () => "noi dung",
  });
  assert.equal(await uploadR2(io, u, scratch), "đã tải lên");
  assert.ok(io.calls.includes(`rclone copyto ${file} r2:ai-translator-releases/models/hy-mt2/bbbbbbbbbbbb/f.gguf --s3-no-check-bucket --immutable`));
  assert.ok(
    io.calls.some((c) => c.startsWith("curl -sI -o /dev/null -w %{http_code} --connect-timeout 20 --max-time 60 https://releases.aitranslator.io.vn/models/hy-mt2/")),
    "kiểm có không bằng HEAD, có hạn chờ",
  );
  const present = fakeIo({ run: (cmd) => (cmd === "curl" ? "200" : ""), download: () => "noi dung" });
  assert.equal(await uploadR2(present, u, scratch), "đã có");
  assert.ok(!present.calls.some((c) => c.startsWith("rclone")));
  const other = fakeIo({ run: (cmd) => (cmd === "curl" ? "200" : ""), download: () => "khac" });
  await assert.rejects(uploadR2(other, u, scratch), /nội dung khác/);
  const edited = fakeIo({ run: (cmd) => (cmd === "curl" ? "404" : "") });
  await assert.rejects(uploadR2(edited, { ...u, sha256: sha256("noi dung cu") }, scratch), /không còn đúng SHA-256 của kế hoạch/);
  assert.ok(!edited.calls.some((c) => c.startsWith("rclone")), "file đã đổi trên đĩa thì không tải lên");
});

test("publicMatches: lỗi mạng của curl (mã 6, 7, 28) kèm gợi ý DNS; mã HTTP lạ cũng vậy", async (t) => {
  const scratch = join(temp(t), "scratch");
  const url = "https://releases.aitranslator.io.vn/models/x";
  for (const status of [6, 7, 28]) {
    const io = fakeIo({ run: (cmd) => (cmd === "curl" ? Object.assign(new Error(`curl thoát mã ${status}`), { status }) : "") });
    await assert.rejects(publicMatches(io, url, SHA("1"), scratch), /dig @8\.8\.8\.8/, `mã ${status}`);
  }
  const broken = fakeIo({ run: (cmd) => (cmd === "curl" ? "200" : ""), download: () => Object.assign(new Error("curl thoát mã 28"), { status: 28 }) });
  await assert.rejects(publicMatches(broken, url, SHA("1"), scratch), /dig @8\.8\.8\.8/, "lỗi lúc tải về");
  await assert.rejects(publicMatches(fakeIo({ run: (cmd) => (cmd === "curl" ? "503" : "") }), url, SHA("1"), scratch), /HTTP 503.*dig/s);
  const other = fakeIo({ run: (cmd) => (cmd === "curl" ? Object.assign(new Error("curl thoát mã 22"), { status: 22 }) : "") });
  await assert.rejects(publicMatches(other, url, SHA("1"), scratch), (e) => !/dig/.test(e.message), "lỗi khác giữ nguyên");
});

/** Kế hoạch tối giản cho các bước git, CI. */
const smallPlan = () => ({
  base: 3,
  target: 4,
  head: "h0",
  bodyRel: "scripts/models/released/body-4.json",
  prevRel: "scripts/models/released/body-3.json",
  files: { "scripts/models/released/body-4.json": "{}", "scripts/models/upstream.json": "{}" },
  bench: [{ from: "/w/gate", to: "bench/model-updates/x" }],
  uploads: [],
  message: "chore(models): thử (manifest số 4)",
});

/** Trả lời các lệnh git của `repoStage`, `recordHead`, `commitAndPush` theo trạng thái `s`. */
function gitAnswers(s) {
  return (args) => {
    const key = args.join(" ");
    if (key === "branch --show-current") return `${s.branch}\n`;
    if (args[0] === "cat-file") return s.pushed ? "" : new Error("không có");
    if (key === "rev-parse HEAD") return `${s.head}\n`;
    if (key === "rev-parse origin/main") return `${s.origin}\n`;
    if (key === "rev-parse HEAD^") return s.parent instanceof Error ? s.parent : `${s.parent}\n`;
    if (args[0] === "status") return s.status;
    if (args[0] === "log") return `${s.subject}\n`;
    return "";
  };
}
const gitState = (over = {}) => ({
  branch: "main",
  head: "h0",
  origin: "h0",
  pushed: false,
  status: "",
  parent: "h0",
  subject: "chore(models): thử (manifest số 4)",
  ...over,
});
const gitFake = (over) => fakeIo({ run: (cmd, args) => (cmd === "git" ? gitAnswers(gitState(over))(args) : "") });

test("recordHead: phải ở main và HEAD đúng origin/main", () => {
  assert.equal(recordHead(gitFake()), "h0");
  assert.throws(() => recordHead(gitFake({ branch: "cap-nhat-model" })), /Phải ở nhánh main/);
  assert.throws(() => recordHead(gitFake({ head: "h1" })), /khác origin\/main/);
});

test("repoStage: pushed, fresh, committed; main đổi, cây có file lạ hay sai nhánh thì dừng", () => {
  const plan = smallPlan();
  assert.equal(repoStage(gitFake({ pushed: true, head: "h9", origin: "h9" }), plan), "pushed");
  assert.equal(repoStage(gitFake(), plan), "fresh");
  const own = " M scripts/models/upstream.json\0?? bench/model-updates/x/s7.json\0?? scripts/models/released/body-4.json\0";
  assert.equal(repoStage(gitFake({ status: own }), plan), "fresh", "chỉ có file của kế hoạch và thư mục kết quả đo");
  assert.throws(() => repoStage(gitFake({ status: `${own}?? ghi-chu.txt\0` }), plan), /file ngoài kế hoạch \(ghi-chu\.txt\)/);
  assert.throws(() => repoStage(gitFake({ status: " M src-tauri/x.rs\0" }), plan), /file ngoài kế hoạch/);
  assert.throws(() => repoStage(gitFake({ status: "?? bench/model-updates/xx/a\0" }), plan), /file ngoài kế hoạch/, "tên thư mục chỉ trùng tiền tố");
  assert.throws(() => repoStage(gitFake({ branch: "cap-nhat-model" }), plan), /Phải ở nhánh main/);
  assert.throws(() => repoStage(gitFake({ head: "h1", origin: "h1" }), plan), /main đã đổi từ lúc gõ y.*runbook mục 13\.3/s);
  assert.throws(() => repoStage(gitFake({ origin: "h1" }), plan), /main đã đổi/, "origin/main tiến lên");
  assert.equal(repoStage(gitFake({ head: "h1", origin: "h0", parent: "h0" }), plan), "committed");
  assert.throws(() => repoStage(gitFake({ head: "h1", parent: "h0", subject: "commit khác" }), plan), /main đã đổi/);
  assert.throws(() => repoStage(gitFake({ head: "h1", parent: "h7" }), plan), /main đã đổi/, "commit không nằm ngay trên plan.head");
  assert.throws(() => repoStage(gitFake({ head: "h1", parent: new Error("không có cha") }), plan), /main đã đổi/);
  assert.throws(() => repoStage(gitFake(), { ...plan, head: undefined }), /main đã đổi/, "kế hoạch chưa ghi head thì không đăng");
});

test("commitRecord: chỉ ở main sạch khớp origin; ghi file, commit đúng đường dẫn rồi đẩy", (t) => {
  const repo = temp(t);
  const plan = { files: { "scripts/models/upstream.json": "{}\n" }, bench: [], message: "chore(models): ghi nhận" };
  const io = gitFake();
  commitRecord(io, plan, repo);
  assert.equal(readFileSync(join(repo, "scripts/models/upstream.json"), "utf8"), "{}\n");
  assert.deepEqual(io.calls.slice(-3), [
    "git add -- scripts/models/upstream.json",
    "git commit -m chore(models): ghi nhận -- scripts/models/upstream.json",
    "git push origin HEAD:main",
  ]);
  const wrong = gitFake({ branch: "x" });
  assert.throws(() => commitRecord(wrong, plan, repo), /Phải ở nhánh main/);
  assert.throws(() => commitRecord(gitFake({ head: "h1" }), plan, repo), /khác origin\/main/);
  assert.throws(() => commitRecord(gitFake(), { ...plan, head: "h5" }, repo), /main đã đổi/);
});

test("commitAndPush: fresh thì add và commit theo đường dẫn rồi đẩy; committed chỉ đẩy", () => {
  const plan = smallPlan();
  const fresh = gitFake();
  assert.equal(commitAndPush(fresh, plan, "fresh"), "h0");
  const paths = "scripts/models/released/body-4.json scripts/models/upstream.json bench/model-updates/x";
  assert.deepEqual(fresh.calls, [`git add -- ${paths}`, `git commit -m chore(models): thử (manifest số 4) -- ${paths}`, "git push origin HEAD:main", "git rev-parse HEAD"]);
  const committed = gitFake();
  commitAndPush(committed, plan, "committed");
  assert.deepEqual(committed.calls, ["git push origin HEAD:main", "git rev-parse HEAD"]);
});

/**
 * `io` giả cho cả git, gh, curl: `git` theo `gitState`; `gh run list` trả `before` trước khi kích workflow, `after` sau đó;
 * `view` là `{ status, conclusion }` của lượt cũ. `extra(cmd, args)` xử lý lệnh khác.
 */
function ciIo({ git = {}, before = [], after = [], view, extra } = {}) {
  let dispatched = false;
  const answers = gitAnswers(gitState({ origin: "abc", head: "abc", ...git }));
  return fakeIo({
    download: () => "noi dung",
    run(cmd, args, opts) {
      if (cmd === "git") return answers(args);
      if (cmd === "gh") {
        if (args[0] === "auth") return "token-thu\n";
        if (args[0] === "workflow") dispatched = true;
        if (args[0] === "run" && args[1] === "list") return JSON.stringify(dispatched ? after : before);
        if (args[0] === "run" && args[1] === "view") return JSON.stringify(view);
        if (args[0] === "run" && args[1] === "download") {
          const dir = args[args.indexOf("-D") + 1];
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, "models.json"), "{}");
        }
        return "";
      }
      return extra?.(cmd, args, opts) ?? "";
    },
  });
}

test("signInCi: kích workflow, chỉ nhận lượt mới có đúng commit của origin/main, đợi xong, tải bản đã ký", (t) => {
  const work = temp(t);
  const plan = smallPlan();
  const saved = [];
  const old = { databaseId: 3, headSha: "abc" };
  const io = ciIo({ before: [old], after: [old, { databaseId: 8, headSha: "abc" }] });
  const path = signInCi(io, plan, { save: (p) => saved.push(p.run), work });
  assert.equal(path, join(work, "signed", "4", "models.json"));
  assert.equal(plan.run, 8, "lượt cũ cùng commit bị bỏ qua");
  assert.deepEqual(saved, [8]);
  assert.ok(io.calls.some((c) => c.startsWith(`gh workflow run sign-manifest.yml --ref main -f body=${plan.bodyRel} -f previous=${plan.prevRel}`)));
  assert.ok(io.calls.some((c) => c.startsWith("gh run watch 8 --exit-status")));
  assert.ok(io.calls.indexOf("git fetch --quiet origin main") < io.calls.findIndex((c) => c.startsWith("gh workflow run")), "lấy origin/main trước khi kích");
});

test("signInCi: lượt mới nhưng sai commit, hay chỉ có lượt cũ, thì không nhận", (t) => {
  const work = temp(t);
  const old = { databaseId: 3, headSha: "abc" };
  const wrongSha = ciIo({ before: [old], after: [old, { databaseId: 9, headSha: "khac" }] });
  assert.throws(() => signInCi(wrongSha, smallPlan(), { save() {}, work }), /Không tìm thấy lượt chạy sign-manifest\.yml/);
  const onlyOld = ciIo({ before: [old], after: [old] });
  assert.throws(() => signInCi(onlyOld, smallPlan(), { save() {}, work }), /Không tìm thấy lượt chạy/);
});

test("signInCi chạy lại: lượt cũ hỏng thì kích lượt mới; lượt cũ còn chạy thì đợi tiếp", (t) => {
  const work = temp(t);
  const failed = { ...smallPlan(), run: 5 };
  const io = ciIo({ before: [{ databaseId: 5, headSha: "abc" }], after: [{ databaseId: 5, headSha: "abc" }, { databaseId: 9, headSha: "abc" }], view: { status: "completed", conclusion: "failure" } });
  signInCi(io, failed, { save() {}, work });
  assert.equal(failed.run, 9);
  const running = { ...smallPlan(), run: 5 };
  const again = ciIo({ view: { status: "in_progress", conclusion: "" } });
  signInCi(again, running, { save() {}, work });
  assert.equal(running.run, 5);
  assert.ok(!again.calls.some((c) => c.startsWith("gh workflow run")));
});

test("verifySigned: đúng khóa và trùng phần thân thì qua; khác phần thân, khóa lạ, chữ ký sửa hay sai định dạng thì dừng", async (t) => {
  const dir = temp(t);
  const key = await testKey("test-u3", "ai-translator update test key 3");
  const keys = [{ kid: key.kid, x: key.x }];
  const bodyText = serializeJson({ schema: 1, sequence: 4 });
  const path = join(dir, "models.json");
  const envelope = await signBody(key.privateKey, key.kid, JSON.stringify(JSON.parse(bodyText)));
  writeFileSync(path, JSON.stringify(envelope));
  await verifySigned(path, bodyText, keys);
  await assert.rejects(verifySigned(path, serializeJson({ schema: 1, sequence: 5 }), keys), /không khớp phần thân/);
  await assert.rejects(verifySigned(path, bodyText, []), /Không có khóa công khai/);
  const sig = Buffer.from(envelope.sig, "base64url");
  sig[0] ^= 1;
  writeFileSync(path, JSON.stringify({ ...envelope, sig: sig.toString("base64url") }));
  await assert.rejects(verifySigned(path, bodyText, keys), /Chữ ký không đúng/);
  writeFileSync(path, JSON.stringify({ ...envelope, format: "khac" }));
  await assert.rejects(verifySigned(path, bodyText, keys), /sai định dạng phong bì/);
  writeFileSync(path, JSON.stringify({ ...envelope, version: 2 }));
  await assert.rejects(verifySigned(path, bodyText, keys), /sai định dạng phong bì/);
});

/** Phong bì `{ body }` của manifest số `sequence` (đủ cho `publishManifest`, không cần chữ ký). */
const liveManifest = (sequence) => JSON.stringify({ body: Buffer.from(JSON.stringify({ sequence })).toString("base64url") });

test("publishManifest: đã đăng thì thôi; chưa thì sao lưu, đăng bằng wrangler, kiểm lại", (t) => {
  const work = temp(t);
  const signedPath = join(work, "models.json");
  const signed = '{"body":"bmV3"}\n';
  writeFileSync(signedPath, signed);
  const plan = smallPlan();
  const old = liveManifest(3);
  const done = fakeIo({ text: () => signed });
  assert.match(publishManifest(done, signedPath, work, plan), /đã được đăng từ trước/);
  assert.ok(!done.calls.some((c) => c.startsWith("pnpm")));
  let live = old;
  const warn = t.mock.method(console, "warn", () => {});
  const io = fakeIo({
    text: () => live,
    run(cmd) {
      if (cmd === "pnpm") live = signed;
      return "";
    },
  });
  assert.match(publishManifest(io, signedPath, work, plan), /đã đăng models\.json/);
  assert.equal(readFileSync(join(work, "backup", "models-seq-3.json"), "utf8"), old);
  assert.ok(
    io.calls.includes(
      `pnpm --dir server exec wrangler r2 object put ai-translator-releases/models/models.json --file ${signedPath} --content-type application/json --cache-control no-cache --remote`,
    ),
  );
  assert.equal(warn.mock.callCount(), 0, "URL không tham số trả đúng bản mới thì không cảnh báo");
  const stuck = fakeIo({ text: () => old });
  assert.throws(() => publishManifest(stuck, signedPath, work, plan), /Đăng lại: pnpm --dir server exec wrangler/);
});

test("publishManifest: URL app tải còn trả bản cũ (cache) thì cảnh báo, không lỗi", (t) => {
  const work = temp(t);
  const signedPath = join(work, "models.json");
  const signed = '{"body":"bmV3"}\n';
  writeFileSync(signedPath, signed);
  const old = liveManifest(3);
  let live = old;
  const warn = t.mock.method(console, "warn", () => {});
  const io = fakeIo({ text: (url) => (url.includes("?t=") ? live : old), run: (cmd) => (cmd === "pnpm" ? ((live = signed), "") : "") });
  assert.match(publishManifest(io, signedPath, work, smallPlan()), /đã đăng models\.json/);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /URL app tải .* chưa trả bản mới \(cache\?\)/);
});

test("publishManifest: manifest đang chạy không phải số base của kế hoạch thì không sao lưu, không đăng", (t) => {
  const work = temp(t);
  const signedPath = join(work, "models.json");
  writeFileSync(signedPath, '{"body":"bmV3"}\n');
  const io = fakeIo({ text: () => liveManifest(7) });
  assert.throws(() => publishManifest(io, signedPath, work, smallPlan()), /manifest đang chạy là số 7, không phải số 3: không đăng/);
  assert.ok(!io.calls.some((c) => c.startsWith("pnpm")));
  assert.ok(!existsSync(join(work, "backup")), "không sao lưu");
});

/** Kế hoạch đủ cho `publish`: một file tải lên, một file ghi vào repo `repo`. */
function publishPlan(repo) {
  const file = join(repo, "model.gguf");
  writeFileSync(file, "noi dung");
  return {
    ...smallPlan(),
    uploads: [{ key: "models/hy-mt2/bbbbbbbbbbbb/f.gguf", path: file, sha256: sha256("noi dung") }],
  };
}

test("publish fresh: ghi file, kiểm phần thân, tải lên, commit, đẩy, ký; ký sai thì wrangler không bao giờ được gọi", async (t) => {
  const repo = temp(t);
  const plan = publishPlan(repo);
  const work = temp(t);
  let uploaded = false;
  const io = ciIo({
    before: [],
    after: [{ databaseId: 8, headSha: "h0" }],
    git: { head: "h0", origin: "h0" },
    extra(cmd) {
      if (cmd === "curl") return uploaded ? "200" : "404";
      if (cmd === "rclone") uploaded = true;
      return "";
    },
  });
  await assert.rejects(publish(io, plan, { save() {}, work, repo }), /sai định dạng phong bì/, "models.json giả không có chữ ký hợp lệ");
  const at = (prefix) => io.calls.findIndex((c) => c.startsWith(prefix));
  assert.ok(existsSync(join(repo, plan.bodyRel)), "đã ghi file kế hoạch");
  assert.ok(at("pnpm build") >= 0 && at("cargo test") > at("pnpm build"));
  assert.ok(at("rclone copyto") > at("cargo test"), "kiểm phần thân trước khi tải lên");
  assert.ok(at("git commit") > at("rclone copyto"), "tải lên trước khi commit");
  assert.ok(at("git push") > at("git commit"));
  assert.ok(at("gh workflow run") > at("git push"));
  assert.ok(!io.calls.some((c) => c.startsWith("pnpm --dir server exec wrangler")), "ký sai thì không đăng");
});

test("publish pushed: không ghi file, không tải lên, không commit; committed: chỉ tải lên rồi đẩy", async (t) => {
  const work = temp(t);
  const repo = temp(t);
  const plan = publishPlan(repo);
  const pushed = ciIo({ git: { pushed: true, head: "h9", origin: "h9" }, after: [{ databaseId: 8, headSha: "h9" }] });
  await assert.rejects(publish(pushed, plan, { save() {}, work, repo }), /sai định dạng phong bì/);
  assert.ok(!existsSync(join(repo, plan.bodyRel)), "không ghi lại file");
  for (const prefix of ["rclone", "pnpm build", "cargo", "git add", "git commit", "git push"]) {
    assert.ok(!pushed.calls.some((c) => c.startsWith(prefix)), prefix);
  }
  assert.ok(pushed.calls.some((c) => c.startsWith("gh workflow run")), "vẫn ký");
  let uploaded = false;
  const committed = ciIo({
    git: { head: "h1", origin: "h0", parent: "h0" },
    after: [{ databaseId: 8, headSha: "h0" }],
    extra(cmd) {
      if (cmd === "curl") return uploaded ? "200" : "404";
      if (cmd === "rclone") uploaded = true;
      return "";
    },
  });
  await assert.rejects(publish(committed, publishPlan(repo), { save() {}, work, repo }), /sai định dạng phong bì/);
  assert.ok(committed.calls.some((c) => c.startsWith("rclone copyto")));
  assert.ok(committed.calls.includes("git push origin HEAD:main"));
  for (const prefix of ["pnpm build", "cargo", "git add", "git commit"]) {
    assert.ok(!committed.calls.some((c) => c.startsWith(prefix)), prefix);
  }
});
