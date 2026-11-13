// Kiểm `notes-manifest.mjs` (kế hoạch 05 Task 3, spec ghi chú cuộc họp §4): `node --test scripts/models/notes-manifest.test.mjs`.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { NOTES_ID, notesEntry, run, withNotes, withoutNotes } from "./notes-manifest.mjs";

const SHA = "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4";
// Bản đang phát hành giả: đủ các khóa gốc khác, để chứng minh `add`/`remove` không đụng chúng.
const prev = () => ({
  schema: 1,
  sequence: 3,
  published_at: "2026-10-21T05:03:38Z",
  files: [{ id: "notice", file: "NOTICE.txt", kind: "license" }],
  packs: [{ id: "standard" }],
  recommend: { fallback: "lite" },
  speaker: { id: "eres2net-voxceleb", file: "eres2net-sv-en-voxceleb-16k.onnx", url: "speaker/be/x.onnx" },
  speaker_config: { theta: 0.4 },
  tts: { id: "vieneu-tts", file: "vieneu.onnx" },
});
const entryOf = (over = {}) =>
  notesEntry({
    file: "/x/Qwen3.5-4B-Q4_K_M.gguf",
    bytes: 2_740_937_888,
    sha256: SHA,
    version: "1",
    minAppVersion: "0.3.0",
    ...over,
  });

// Vector chép từ `fn notes_entry` trong test của src-tauri/src/models/manifest.rs (kế hoạch 03 Task 1): mục hợp lệ mà app đọc được.
const RUST_VECTOR = {
  id: "notes-qwen35-4b",
  version: "1",
  file: "Qwen3.5-4B-Q4_K_M.gguf",
  url: "notes/00fe7986ff5f/Qwen3.5-4B-Q4_K_M.gguf",
  bytes: 2_740_937_888,
  sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
  license_id: "Apache-2.0",
  min_app_version: "0.3.0",
  min_ram_mib: 15360,
  ctx: 16384,
};

test("mục sinh ra đọc được bằng luật của app: từng trường khớp vector notes_entry của manifest.rs", () => {
  assert.equal(NOTES_ID, "notes-qwen35-4b");
  assert.deepEqual(entryOf(), RUST_VECTOR);
});

test("url nằm dưới notes/ theo 12 ký tự đầu của sha256", () => {
  const e = entryOf({ sha256: "ab".repeat(32), file: "/x/model.gguf" });
  assert.equal(e.url, `notes/${"ab".repeat(6)}/model.gguf`);
});

test("notesEntry từ chối ctx, min_ram_mib, bytes, tên file, min_app_version, sha256, version, license sai, nêu đúng trường", () => {
  for (const [over, field] of [
    [{ ctx: 8191 }, "ctx"],
    [{ ctx: 32769 }, "ctx"],
    [{ ctx: 16384.5 }, "ctx"],
    [{ minRamMib: 8191 }, "min_ram_mib"],
    [{ minRamMib: 65537 }, "min_ram_mib"],
    [{ bytes: 0 }, "bytes"],
    [{ bytes: 4 * 1024 ** 3 + 1 }, "bytes"],
    [{ bytes: 1.5 }, "bytes"],
    [{ file: "/x/a b.gguf" }, "file"],
    [{ file: "/x/model.gguf.part" }, "file"],
    [{ file: "/x/model.tmp" }, "file"],
    [{ file: "/x/manifest.json" }, "file"],
    [{ file: "/x/NUL.gguf" }, "file"],
    [{ file: "/x/trailing." }, "file"],
    [{ minAppVersion: "0.3" }, "min_app_version"],
    [{ minAppVersion: undefined }, "min_app_version"],
    [{ sha256: "xyz" }, "sha256"],
    [{ sha256: "AB".repeat(32) }, "sha256"],
    [{ version: "" }, "version"],
    [{ licenseId: " " }, "license_id"],
  ]) {
    assert.throws(() => entryOf(over), new RegExp(`trường ${field}`), JSON.stringify(over));
  }
});

test("add ghi body kế tiếp có khóa notes và giữ nguyên mọi khóa khác", () => {
  const next = withNotes(prev(), entryOf(), "2026-11-01T00:00:00Z");
  const before = prev();
  assert.equal(next.sequence, 4);
  assert.equal(next.published_at, "2026-11-01T00:00:00Z");
  assert.deepEqual(next.notes, RUST_VECTOR);
  for (const key of Object.keys(before)) {
    if (key === "sequence" || key === "published_at") continue;
    assert.deepEqual(next[key], before[key], `khóa ${key} bị đổi`);
  }
  assert.deepEqual(Object.keys(next).sort(), [...Object.keys(before), "notes"].sort());
});

test("add hai lần thay mục cũ, không tạo hai mục", () => {
  const once = withNotes(prev(), entryOf(), "2026-11-01T00:00:00Z");
  const twice = withNotes(once, entryOf({ version: "2", minAppVersion: "0.4.0" }), "2026-11-02T00:00:00Z");
  assert.equal(twice.sequence, 5);
  assert.equal(twice.notes.version, "2");
  assert.equal(twice.notes.min_app_version, "0.4.0");
  assert.equal(Object.keys(twice).filter((k) => k === "notes").length, 1);
});

test("add từ chối khi id hay tên file trùng một mục trong files hay speaker (app sẽ bỏ ghi chú nếu trùng)", () => {
  const clashId = prev();
  clashId.files.push({ id: NOTES_ID, file: "other.bin", kind: "asr" });
  assert.throws(() => withNotes(clashId, entryOf(), "2026-11-01T00:00:00Z"), /trùng/);
  const clashFile = prev();
  clashFile.files.push({ id: "x", file: "QWEN3.5-4B-Q4_K_M.GGUF", kind: "asr" });
  assert.throws(() => withNotes(clashFile, entryOf(), "2026-11-01T00:00:00Z"), /trùng/);
  const clashSpeaker = prev();
  clashSpeaker.speaker.file = "qwen3.5-4b-q4_k_m.gguf";
  assert.throws(() => withNotes(clashSpeaker, entryOf(), "2026-11-01T00:00:00Z"), /trùng/);
});

test("remove bỏ khóa notes và giữ nguyên mọi khóa khác; không có notes thì từ chối", () => {
  const on = withNotes(prev(), entryOf(), "2026-11-01T00:00:00Z");
  const off = withoutNotes(on, "2026-11-03T00:00:00Z");
  assert.equal(off.sequence, 5);
  assert.equal("notes" in off, false);
  for (const key of Object.keys(prev())) {
    if (key === "sequence" || key === "published_at") continue;
    assert.deepEqual(off[key], prev()[key], `khóa ${key} bị đổi`);
  }
  assert.throws(() => withoutNotes(prev(), "2026-11-03T00:00:00Z"), /không có mục notes/);
});

test("lệnh ghi body-<N+1>.json, in việc cần làm, tính sha256 và bytes của file thật, không ghi đè", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "notes-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "body-3.json"), `${JSON.stringify(prev(), null, 2)}\n`);
  const model = join(dir, "Qwen3.5-4B-Q4_K_M.gguf");
  writeFileSync(model, "gguf-bytes");
  const lines = [];
  const now = new Date("2026-11-01T12:34:56.789Z");
  const done = await run(["add", "--file", model, "--min-app-version", "0.3.0"], { releasedDir: dir, now, log: (l) => lines.push(l) });
  assert.equal(done.next.sequence, 4);
  assert.equal(done.next.published_at, "2026-11-01T12:34:56Z");
  const text = readFileSync(join(dir, "body-4.json"), "utf8");
  assert.ok(text.endsWith("}\n"));
  const written = JSON.parse(text).notes;
  assert.equal(written.bytes, 10);
  assert.equal(written.sha256, createHash("sha256").update("gguf-bytes").digest("hex"));
  assert.equal(written.min_ram_mib, 15360);
  assert.equal(written.ctx, 16384);
  assert.ok(lines.some((l) => l.includes("models/notes/")), "thiếu dòng tải lên models/notes/");
  assert.ok(lines.some((l) => l.includes("body-4.json") && l.includes("body-3.json")), "thiếu dòng ký body-4 với previous body-3");
  // Lần hai thay mục cũ ở body-5.
  const again = await run(["add", "--file", model, "--min-app-version", "0.3.1", "--min-ram-mib", "16384", "--ctx", "8192"], {
    releasedDir: dir,
    now,
    log: () => {},
  });
  assert.equal(again.next.sequence, 5);
  assert.deepEqual([again.next.notes.min_app_version, again.next.notes.min_ram_mib, again.next.notes.ctx], ["0.3.1", 16384, 8192]);
  // Tắt khẩn ghi body-6.json.
  const off = await run(["remove"], { releasedDir: dir, now, log: () => {} });
  assert.equal(off.next.sequence, 6);
  assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith("body-")).sort(), ["body-3.json", "body-4.json", "body-5.json", "body-6.json"]);
});

test("--released-dir đọc và ghi ở thư mục khác; tham số sai bị từ chối", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "notes-manifest-dir-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "body-7.json"), `${JSON.stringify({ ...prev(), sequence: 7 }, null, 2)}\n`);
  const model = join(dir, "m.gguf");
  writeFileSync(model, "x");
  const done = await run(["add", "--file", model, "--min-app-version", "0.3.0", "--released-dir", dir], { log: () => {} });
  assert.equal(done.next.sequence, 8);
  assert.equal(done.path, join(dir, "body-8.json"));
  await assert.rejects(run([], { releasedDir: ".", log: () => {} }), /Dùng:/);
  await assert.rejects(run(["add", "--file"], { releasedDir: ".", log: () => {} }), /Tham số không hợp lệ/);
  await assert.rejects(run(["add", "--file", join(dir, "khong-co.gguf"), "--min-app-version", "0.3.0"], { releasedDir: dir, log: () => {} }), /file model/);
  await assert.rejects(run(["add", "--file", model, "--min-app-version", "0.3.0", "--ctx", "abc"], { releasedDir: dir, log: () => {} }), /trường ctx/);
});
