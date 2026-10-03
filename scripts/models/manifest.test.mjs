// Test các script manifest model (kế hoạch 04). Chạy: node --test scripts/models/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO, signBody, testKey, verifyEnvelope } from "./lib.mjs";

const script = (name) => resolve(REPO, "scripts/models", name);
const run = (name, args) => spawnSync(process.execPath, [script(name), ...args], { encoding: "utf8" });
/** Thư mục tạm của một test, xóa khi test xong (`t.after` chạy cả khi test lỗi). */
const temp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mt-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test("bộ vector trong repo đúng như script sinh ra", () => {
  const fresh = execFileSync(process.execPath, [script("gen-manifest-vectors.mjs")], { encoding: "utf8" });
  const committed = readFileSync(resolve(REPO, "src-tauri/src/models/testdata/manifest-vectors.json"), "utf8");
  assert.equal(fresh, committed);
});

test("ký rồi kiểm được; sửa phần thân thì hỏng", async () => {
  const k = await testKey("test-m1", "ai-translator manifest test key 1");
  const envelope = await signBody(k.privateKey, k.kid, JSON.stringify({ schema: 1, sequence: 7 }));
  assert.deepEqual(await verifyEnvelope(envelope, [k]), { schema: 1, sequence: 7 });
  const tampered = { ...envelope, body: Buffer.from(JSON.stringify({ schema: 1, sequence: 8 })).toString("base64url") };
  await assert.rejects(verifyEnvelope(tampered, [k]), /Chữ ký không đúng/);
  await assert.rejects(verifyEnvelope({ ...envelope, kid: "test-m2" }, [k]), /Không có khóa công khai/);
});

test("build-manifest tính bytes và sha256 từ file thật", (t) => {
  const dir = temp(t);
  writeFileSync(join(dir, "a.bin"), "worker");
  const config = join(dir, "config.json");
  writeFileSync(
    config,
    JSON.stringify({
      files: [{ id: "a", tier: ["p"], kind: "asr", version: "1", file: "a.bin", url: "a.bin", license_id: "MIT", min_app_version: "0.1.0" }],
      packs: [{ id: "p", name: { vi: "P", en: "P" }, note: { vi: "n", en: "n" } }],
      recommend: { min_ram_mib: 1, rules: [], fallback: "p" },
    }),
  );
  const out = run("build-manifest.mjs", ["--dir", dir, "--sequence", "4", "--config", config, "--published-at", "2026-10-02T00:00:00Z"]);
  assert.equal(out.status, 0, out.stderr);
  const body = JSON.parse(out.stdout);
  assert.equal(body.sequence, 4);
  assert.equal(body.published_at, "2026-10-02T00:00:00Z");
  assert.equal(body.files[0].bytes, 6);
  // printf worker | shasum -a 256
  assert.equal(body.files[0].sha256, "87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e");
  assert.equal("pipeline" in body, false);
  const missing = run("build-manifest.mjs", ["--dir", join(dir, "khong-co"), "--sequence", "4", "--config", config]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Thiếu file/);
  assert.equal(run("build-manifest.mjs", ["--dir", dir, "--sequence", "0", "--config", config]).status, 2);
});

test("cấu hình staging trong repo có đủ file cho hai gói", () => {
  const config = JSON.parse(readFileSync(script("models.config.json"), "utf8"));
  for (const pack of ["standard", "lite"]) {
    const kinds = config.files.filter((f) => f.tier.includes(pack)).map((f) => f.kind);
    for (const kind of ["asr", "mt", "vad"]) assert.equal(kinds.filter((k) => k === kind).length, 1, `${pack} ${kind}`);
    assert.ok(kinds.includes("license"), pack);
  }
  assert.ok(config.files.some((f) => f.file === "NOTICE.txt"));
});

test("gen-manifest-key: chỉ ghi khóa riêng ra ngoài repo, quyền 0600, in khóa công khai", (t) => {
  const dir = temp(t);
  const keys = join(dir, "keys.json");
  writeFileSync(keys, JSON.stringify({ staging: [{ kid: "stg-2026-10-1", x: "x" }], production: [] }));
  const inside = run("gen-manifest-key.mjs", ["stg-2026-10-2", "--out", resolve(REPO, "k.jwk"), "--keys", keys]);
  assert.equal(inside.status, 2);
  assert.match(inside.stderr, /không được nằm trong repo/);
  assert.equal(run("gen-manifest-key.mjs", ["stg-2026-10-1", "--out", join(dir, "a.jwk"), "--keys", keys]).status, 2, "kid đã có");
  assert.equal(run("gen-manifest-key.mjs", ["prod-2026-10-1", "--out", join(dir, "b.jwk"), "--keys", keys]).status, 2, "chỉ staging");
  const ok = run("gen-manifest-key.mjs", ["stg-2026-10-2", "--out", join(dir, "c.jwk"), "--keys", keys]);
  assert.equal(ok.status, 0, ok.stderr);
  const pub = JSON.parse(ok.stdout);
  assert.equal(pub.kid, "stg-2026-10-2");
  assert.equal("d" in pub, false, "stdout không có khóa riêng");
  assert.equal(statSync(join(dir, "c.jwk")).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(join(dir, "c.jwk"), "utf8")).x, pub.x);
  assert.equal(run("gen-manifest-key.mjs", ["stg-2026-10-3", "--out", join(dir, "c.jwk"), "--keys", keys]).status, 2, "không ghi đè");
});

test("gen-manifest-key --production: chỉ kid prod-, không trùng kid ở khối nào (kế hoạch 07b)", (t) => {
  const dir = temp(t);
  const keys = join(dir, "keys.json");
  writeFileSync(keys, JSON.stringify({ staging: [{ kid: "prod-2026-11-1", x: "x" }], production: [] }));
  assert.equal(run("gen-manifest-key.mjs", ["stg-2026-11-1", "--production", "--out", join(dir, "a.jwk"), "--keys", keys]).status, 2);
  assert.equal(run("gen-manifest-key.mjs", ["prod-2026-11-1", "--production", "--out", join(dir, "b.jwk"), "--keys", keys]).status, 2, "kid đã có");
  const inside = run("gen-manifest-key.mjs", ["prod-2026-11-2", "--production", "--out", resolve(REPO, "p.jwk"), "--keys", keys]);
  assert.match(inside.stderr, /không được nằm trong repo/);
  const ok = run("gen-manifest-key.mjs", ["prod-2026-11-2", "--production", "--out", join(dir, "c.jwk"), "--keys", keys]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).kid, "prod-2026-11-2");
  assert.match(ok.stderr, /khối "production"/);
  assert.equal(statSync(join(dir, "c.jwk")).mode & 0o777, 0o600);
});

test("sign-manifest: chỉ ký bằng khóa có trong khối của môi trường, và tự kiểm lại", (t) => {
  const dir = temp(t);
  const keys = join(dir, "keys.json");
  writeFileSync(keys, JSON.stringify({ staging: [], production: [] }));
  const made = run("gen-manifest-key.mjs", ["stg-2026-10-5", "--out", join(dir, "k.jwk"), "--keys", keys]);
  assert.equal(made.status, 0, made.stderr);
  const body = join(dir, "body.json");
  writeFileSync(body, JSON.stringify({ schema: 1, sequence: 2, files: [] }));
  const args = ["--key", join(dir, "k.jwk"), "--body", body, "--out", join(dir, "models.json"), "--keys", keys];
  const unknown = run("sign-manifest.mjs", args);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /không có trong khối staging/);
  writeFileSync(keys, JSON.stringify({ staging: [JSON.parse(made.stdout)], production: [] }));
  assert.equal(run("sign-manifest.mjs", [...args, "--env", "production"]).status, 2, "khóa staging không ký production");
  const signed = run("sign-manifest.mjs", args);
  assert.equal(signed.status, 0, signed.stderr);
  const envelope = JSON.parse(readFileSync(join(dir, "models.json"), "utf8"));
  assert.equal(envelope.kid, "stg-2026-10-5");
  assert.equal(envelope.format, "ai-translator-models");
});

// Chạy lại cả file này trong một tiến trình con với thư mục tạm riêng: sau khi chạy xong, không còn thư mục `mt-manifest-*`
// nào (mỗi test tự xóa thư mục tạm của nó bằng `t.after`, chạy cả khi test lỗi). Tiến trình con bỏ qua test này.
test("mọi thư mục tạm của file test này đều bị xóa sau khi chạy", { skip: process.env.MT_MANIFEST_TEST_CHILD === "1" }, () => {
  const tmp = mkdtempSync(join(tmpdir(), "mt-manifest-check-"));
  try {
    // Bỏ NODE_TEST_CONTEXT của test runner cha, để tiến trình con chạy như một lần `node --test` bình thường.
    const { NODE_TEST_CONTEXT: _, ...parent } = process.env;
    const env = { ...parent, MT_MANIFEST_TEST_CHILD: "1", TMPDIR: tmp, TMP: tmp, TEMP: tmp };
    const child = spawnSync(process.execPath, ["--test", fileURLToPath(import.meta.url)], { encoding: "utf8", env });
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.deepEqual(readdirSync(tmp).filter((name) => name.startsWith("mt-manifest-")), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
