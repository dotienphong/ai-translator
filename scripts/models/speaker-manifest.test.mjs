// Kiểm `speaker-manifest.mjs` (kế hoạch 07 của phân biệt người nói): `node --test scripts/models/speaker-manifest.test.mjs`.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bumpBody } from "./update-lib.mjs";
import { SPEAKER_ID, run, speakerEntry, withSpeaker, withoutSpeaker } from "./speaker-manifest.mjs";

const SHA = "be".repeat(32);
const prev = () => ({
  schema: 1,
  sequence: 3,
  published_at: "2026-10-21T05:03:38Z",
  files: [{ id: "notice", file: "NOTICE.txt", kind: "license" }],
  packs: [{ id: "standard" }],
  recommend: { fallback: "lite" },
});
const entryOf = (over = {}) =>
  speakerEntry({ file: "/x/eres2net-sv-en-voxceleb-16k.onnx", bytes: 26_496_496, sha256: SHA, version: "1", minAppVersion: "0.3.2", ...over });

test("mục speaker: url tương đối theo 12 ký tự đầu của SHA-256, id cố định, giấy phép mặc định Apache-2.0", () => {
  assert.deepEqual(entryOf(), {
    id: SPEAKER_ID,
    version: "1",
    file: "eres2net-sv-en-voxceleb-16k.onnx",
    url: `speaker/${SHA.slice(0, 12)}/eres2net-sv-en-voxceleb-16k.onnx`,
    bytes: 26_496_496,
    sha256: SHA,
    license_id: "Apache-2.0",
    min_app_version: "0.3.2",
  });
});

test("mục speaker sai bị từ chối, nêu đúng trường", () => {
  for (const [over, field] of [
    [{ sha256: "xyz" }, "sha256"],
    [{ bytes: 0 }, "bytes"],
    [{ bytes: 201 << 20 }, "bytes"],
    [{ minAppVersion: "0.3" }, "min_app_version"],
    [{ minAppVersion: undefined }, "min_app_version"],
    [{ file: "/x/a b.onnx" }, "file"],
    [{ file: "/x/model.onnx.part" }, "file"],
    [{ version: "" }, "version"],
  ]) {
    assert.throws(() => entryOf(over), new RegExp(`trường ${field}`), JSON.stringify(over));
  }
});

test("thêm speaker: số tăng 1, các phần khác giữ nguyên, speaker_config tùy chọn", () => {
  const next = withSpeaker(prev(), entryOf(), { theta: 0.4 }, "2026-11-01T00:00:00Z");
  assert.equal(next.sequence, 4);
  assert.equal(next.published_at, "2026-11-01T00:00:00Z");
  assert.deepEqual(next.files, prev().files);
  assert.deepEqual(next.packs, prev().packs);
  assert.deepEqual(next.recommend, prev().recommend);
  assert.equal(next.speaker.id, SPEAKER_ID);
  assert.deepEqual(next.speaker_config, { theta: 0.4 });
  assert.equal("speaker_config" in withSpeaker(prev(), entryOf(), undefined, "2026-11-01T00:00:00Z"), false);
});

test("thêm speaker hai lần, hay trùng id hay tên file trong files, bị từ chối", () => {
  const once = withSpeaker(prev(), entryOf(), undefined, "2026-11-01T00:00:00Z");
  assert.throws(() => withSpeaker(once, entryOf(), undefined, "2026-11-02T00:00:00Z"), /đã có mục speaker/);
  const clash = prev();
  clash.files.push({ id: "x", file: "ERES2NET-sv-en-voxceleb-16k.onnx", kind: "asr" });
  assert.throws(() => withSpeaker(clash, entryOf(), undefined, "2026-11-01T00:00:00Z"), /trùng/);
});

test("tắt khẩn: bỏ speaker và speaker_config, số tăng 1; không có speaker thì từ chối", () => {
  const on = withSpeaker(prev(), entryOf(), { theta: 0.4 }, "2026-11-01T00:00:00Z");
  const off = withoutSpeaker(on, "2026-11-03T00:00:00Z");
  assert.equal(off.sequence, 5);
  assert.equal("speaker" in off, false);
  assert.equal("speaker_config" in off, false);
  assert.deepEqual(off.files, prev().files);
  assert.throws(() => withoutSpeaker(prev(), "2026-11-03T00:00:00Z"), /không có mục speaker/);
});

test("pnpm models:update (bumpBody) giữ speaker và speaker_config của bản đang phát hành", () => {
  const on = withSpeaker(prev(), entryOf(), { theta: 0.4 }, "2026-11-01T00:00:00Z");
  const next = bumpBody(on, {}, "2026-11-05T00:00:00Z");
  assert.deepEqual(next.speaker, on.speaker);
  assert.deepEqual(next.speaker_config, on.speaker_config);
  assert.equal(next.sequence, 5);
});

test("lệnh ghi body-<N+1>.json, in việc cần làm, không ghi đè", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "spk-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "body-3.json"), `${JSON.stringify(prev(), null, 2)}\n`);
  const model = join(dir, "eres2net-sv-en-voxceleb-16k.onnx");
  writeFileSync(model, "model-bytes");
  const lines = [];
  const now = new Date("2026-11-01T12:34:56.789Z");
  const done = await run(["add", "--file", model, "--min-app-version", "0.3.2"], { releasedDir: dir, now, log: (l) => lines.push(l) });
  assert.equal(done.next.sequence, 4);
  assert.equal(done.next.published_at, "2026-11-01T12:34:56Z");
  const text = readFileSync(join(dir, "body-4.json"), "utf8");
  assert.ok(text.endsWith("}\n"));
  assert.equal(JSON.parse(text).speaker.bytes, 11);
  assert.ok(lines.some((l) => l.includes("models/speaker/")));
  assert.ok(lines.some((l) => l.includes("body-4.json") && l.includes("body-3.json")));
  // Lần hai: bản mới nhất đã có speaker.
  await assert.rejects(run(["add", "--file", model, "--min-app-version", "0.3.2"], { releasedDir: dir, now, log: () => {} }), /đã có mục speaker/);
  // Tắt khẩn ghi body-5.json.
  const off = await run(["remove"], { releasedDir: dir, now, log: () => {} });
  assert.equal(off.next.sequence, 5);
  assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith("body-")).sort(), ["body-3.json", "body-4.json", "body-5.json"]);
});

test("--released-dir đọc và ghi ở thư mục khác, không đụng thư mục mặc định", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "spk-manifest-dir-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "body-7.json"), `${JSON.stringify({ ...prev(), sequence: 7 }, null, 2)}\n`);
  const model = join(dir, "m.onnx");
  writeFileSync(model, "x");
  const done = await run(["add", "--file", model, "--min-app-version", "0.3.2", "--released-dir", dir], { log: () => {} });
  assert.equal(done.next.sequence, 8);
  assert.equal(done.path, join(dir, "body-8.json"));
});

test("tham số sai", async () => {
  await assert.rejects(run([], { releasedDir: ".", log: () => {} }), /Dùng:/);
  await assert.rejects(run(["add", "--file"], { releasedDir: ".", log: () => {} }), /Tham số không hợp lệ/);
});
