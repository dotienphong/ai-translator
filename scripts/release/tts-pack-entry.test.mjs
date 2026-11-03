import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { root } from "./versions.mjs";
import { buildEntry, modelFiles, urlPrefixErrors } from "./tts-pack-entry.mjs";

const tts = readFileSync(join(root, "src-tauri", "src", "tts.rs"), "utf8");

test("danh sách file lấy từ MODEL_FILES của tts.rs (13 file, có thư mục con)", () => {
  const files = modelFiles(tts);
  assert.equal(files.length, 13);
  assert.ok(files.includes("sea_g2p.bin"));
  assert.ok(files.includes("moss-codec/moss_audio_tokenizer_decode_step.onnx"));
  assert.ok(files.every((f) => !f.startsWith("/") && !f.includes("..")));
});

test("mục tts: SHA-256 và kích thước từng file, URL theo tiền tố", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tts-pack-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = ["a.bin", "sub/b.json"];
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), `nội dung ${f}`);
  }
  const entry = await buildEntry({ dir, files, id: "vieneu-v3-turbo", version: "1", license: "Apache-2.0", minApp: "0.5.7", urlPrefix: "tts/vieneu-v3-turbo-1" });
  assert.equal(entry.min_app_version, "0.5.7");
  assert.deepEqual(entry.files.map((f) => f.url), ["tts/vieneu-v3-turbo-1/a.bin", "tts/vieneu-v3-turbo-1/sub/b.json"]);
  const b = Buffer.from("nội dung sub/b.json");
  assert.deepEqual(entry.files[1], {
    path: "sub/b.json",
    url: "tts/vieneu-v3-turbo-1/sub/b.json",
    bytes: b.length,
    sha256: createHash("sha256").update(b).digest("hex"),
  });
});

test("thiếu file, file rỗng, min-app hay tiền tố sai: lỗi", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "tts-pack-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "empty.bin"), "");
  const base = { dir, id: "x", version: "1", license: "MIT", minApp: "0.5.7", urlPrefix: "tts/x-1" };
  await assert.rejects(buildEntry({ ...base, files: ["khong-co.bin"] }), /thiếu/);
  await assert.rejects(buildEntry({ ...base, files: ["empty.bin"] }), /không phải file có nội dung/);
  await assert.rejects(buildEntry({ ...base, files: [], minApp: "moi" }), /--min-app/);
  await assert.rejects(buildEntry({ ...base, files: [], urlPrefix: "../x" }), /--url-prefix/);
  assert.deepEqual(urlPrefixErrors("tts/vieneu-1.0"), []);
  assert.notDeepEqual(urlPrefixErrors("https://x"), []);
  assert.notDeepEqual(urlPrefixErrors(""), []);
});
