// Test của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md mục 9).
// Chạy: node --test scripts/models/update.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { REPO, signBody, testKey } from "./lib.mjs";
import {
  MANIFEST_URL,
  checkTable,
  checkUpstream,
  contentId,
  convertInputs,
  detect,
  latestBody,
  parseArgs,
  sameSignedBody,
} from "./update-lib.mjs";
import { checkLiveManifest, checkSources, fetchFile } from "./update-io.mjs";

/** Thư mục tạm của một test, xóa khi test xong. */
export const temp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mt-update-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const readJson = (path) => JSON.parse(readFileSync(resolve(REPO, path), "utf8"));
const SHA = (c) => c.repeat(64);
const REV = (c) => c.repeat(40);

/**
 * `io` giả: `handlers.run(cmd, args, opts)` trả stdout hay một `Error` (để ném); `handlers.text(url)` trả nội dung URL;
 * `handlers.download(url)` trả nội dung file tải về. Mọi lời gọi ghi vào `calls`.
 */
export function fakeIo(handlers = {}) {
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
    json: (url) => JSON.parse(io.text(url)),
    download(url, dest) {
      calls.push(`download ${url}`);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, handlers.download(url));
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
  for (const bad of [["--check", "x"], ["--gate-only"], ["--rollback-to", "0"], ["--rollback-to", "3a"], ["--khac"]]) {
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
  const problems = checkUpstream(broken, config, body);
  assert.ok(problems.some((p) => p.startsWith("hy-mt2-1.8b-q8_0: content khác")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("khong-co: không có trong models.config.json")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("whisper-small-q5_1: thiếu gate.baseline")), problems.join("\n"));
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
});
