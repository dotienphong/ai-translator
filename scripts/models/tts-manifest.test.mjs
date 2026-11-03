// Kiểm `tts-manifest.mjs`: `node --test scripts/models/tts-manifest.test.mjs`.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkTtsEntry, run, withTts, withoutTts } from "./tts-manifest.mjs";

const SHA = "cd".repeat(32);
const prev = () => ({
  schema: 1,
  sequence: 4,
  published_at: "2026-10-28T17:32:03Z",
  files: [{ id: "notice", file: "NOTICE.txt", kind: "license" }],
  packs: [{ id: "standard" }],
  recommend: { fallback: "lite" },
  speaker: { id: "eres2net-voxceleb" },
});
const entry = (over = {}) => ({
  id: "vieneu-v3-turbo",
  version: "1",
  license_id: "Apache-2.0",
  min_app_version: "0.5.7",
  files: [
    { path: "sea_g2p.bin", url: "tts/vieneu-v3-turbo-1/sea_g2p.bin", bytes: 100, sha256: SHA },
    { path: "moss-codec/meta.json", url: "tts/vieneu-v3-turbo-1/moss-codec/meta.json", bytes: 10, sha256: SHA },
  ],
  ...over,
});

test("thêm mục tts: số tăng, giữ speaker và các khóa khác", () => {
  const next = withTts(prev(), entry(), "2026-11-03T02:00:00Z");
  assert.equal(next.sequence, 5);
  assert.equal(next.published_at, "2026-11-03T02:00:00Z");
  assert.deepEqual(next.speaker, { id: "eres2net-voxceleb" });
  assert.equal(next.tts.files.length, 2);
});

test("đã có tts thì từ chối thêm; bỏ tts khi không có thì lỗi; bỏ xong không còn khóa", () => {
  const withIt = withTts(prev(), entry(), "2026-11-03T02:00:00Z");
  assert.throws(() => withTts(withIt, entry(), "x"), /đã có mục tts/);
  assert.throws(() => withoutTts(prev(), "x"), /không có mục tts/);
  const gone = withoutTts(withIt, "2026-11-04T00:00:00Z");
  assert.equal("tts" in gone, false);
  assert.equal(gone.sequence, 6);
});

test("mục tts sai bị từ chối, nêu đúng trường (cùng luật với app)", () => {
  const f = (i, k, v) => entry({ files: entry().files.map((x, n) => (n === i ? { ...x, [k]: v } : x)) });
  for (const [e, field] of [
    [entry({ id: "HOA" }), "id"],
    [entry({ min_app_version: "0.5" }), "min_app_version"],
    [entry({ license_id: " " }), "license_id"],
    [entry({ files: [] }), "files"],
    [entry({ files: [entry().files[0], { ...entry().files[1], path: "SEA_G2P.BIN" }] }), "files"],
    [f(0, "path", "../x.bin"), "files.path"],
    [f(0, "path", "a/b.part"), "files.path"],
    [f(0, "url", "http://x/y"), "files.url"],
    [f(0, "bytes", 0), "files.bytes"],
    [f(0, "bytes", 3 * 2 ** 30), "files.bytes"],
    [f(0, "sha256", "xyz"), "files.sha256"],
    [entry({ files: [1, 2, 3, 4].map((n) => ({ path: `f${n}.bin`, url: `t/f${n}.bin`, bytes: 1.5 * 2 ** 30 - 1, sha256: SHA })) }), "bytes"],
  ]) {
    assert.throws(() => checkTtsEntry(e), new RegExp(`trường ${field.replace(".", "\\.")}$`), field);
  }
});

test("run add ghi body-<N+1>.json, không ghi đè và không đụng bản cũ", () => {
  const dir = mkdtempSync(join(tmpdir(), "tts-manifest-"));
  try {
    writeFileSync(join(dir, "body-4.json"), `${JSON.stringify(prev(), null, 2)}\n`);
    const file = join(dir, "entry.json");
    writeFileSync(file, JSON.stringify(entry()));
    const logs = [];
    const r = run(["add", "--entry", file, "--released-dir", dir], { now: new Date("2026-11-03T02:00:00Z"), log: (m) => logs.push(m) });
    assert.equal(r.next.sequence, 5);
    assert.deepEqual(readdirSync(dir).sort(), ["body-4.json", "body-5.json", "entry.json"]);
    assert.equal(JSON.parse(readFileSync(join(dir, "body-5.json"), "utf8")).tts.id, "vieneu-v3-turbo");
    assert.throws(() => run(["add", "--entry", file, "--released-dir", dir], { log: () => {} }), /đã có mục tts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
