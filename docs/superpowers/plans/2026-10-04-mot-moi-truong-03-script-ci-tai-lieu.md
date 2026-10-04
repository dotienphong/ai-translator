# Một môi trường production · 03: Script ký khóa, cổng CI, tài liệu và spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** (1) Gỡ staging khỏi các script sinh và ký khóa manifest model; (2) thêm cổng CI `no-dev-gate` quét binary phát hành tìm mã công tắc dev và gắn vào bước đóng gói macOS, Windows; (3) sửa tài liệu phát hành, spec gốc, spec mới và `CLAUDE.md` cho khớp "chỉ một môi trường production"; (4) kiểm toàn bộ cả ba kế hoạch của đợt.

**Kiến trúc:** `scripts/models/*` bỏ tham số `--env` và cờ `--production` (khóa manifest chỉ còn production, kid luôn `prod-…`). `release-check.mjs` thêm hàm thuần `devGateErrors(binary)` và lệnh `no-dev-gate <file>…`; `package-macos.sh` và `package-windows.mjs` gọi nó ngay sau bước `embedded` ở cả hai pha (`build` và `sign`/`bundle`), nên một bản phát hành có mã dev không bao giờ tới bước ký hay notarize.

**Công nghệ:** Node 24 (`node --test`, không gói npm), POSIX sh, Markdown. Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-10-04-single-production-environment-design.md` mục 3 (lớp 4), 5, 6. Task 2 cần tên biến `AI_TRANSLATOR_DEV_PRO` và chuỗi `mt-dev-pro-gate-v1` mà kế hoạch 01 Task 1 đặt. Kế hoạch này làm được song song với 01 và 02; riêng Task 6 phải chạy sau cả hai.

Quy ước chung: mọi lệnh chạy ở gốc repo `/Users/dtphong/Desktop/software_business/ai-translator`. Commit kết thúc bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## Task 1: Script ký và sinh khóa manifest chỉ còn production

**Files:**
- Modify: `scripts/models/lib.mjs:74-78`, `scripts/models/gen-manifest-key.mjs`, `scripts/models/sign-manifest.mjs`
- Modify: `scripts/models/manifest.test.mjs:62-125`
- Modify: `scripts/release/sign-manifest-ci.mjs` (dòng 13 và 65), `scripts/release/signing.test.mjs` (dòng 73, 95, 107)

- [ ] **Step 1: Viết lại test (red)**

1a. `scripts/models/manifest.test.mjs`: đổi tên test dòng 62: `"cấu hình staging trong repo có đủ file cho hai gói"` → `"cấu hình trong repo có đủ file cho hai gói"`.

1b. Thay ba test dòng 72–125 (`gen-manifest-key: chỉ ghi khóa riêng…`, `gen-manifest-key --production: …`, `sign-manifest: chỉ ký bằng khóa có trong khối của môi trường…`) bằng bốn test sau. Giữ nguyên các dòng chú thích và test "mọi thư mục tạm…" ngay phía dưới.

```js
test("gen-manifest-key: chỉ ghi khóa riêng ra ngoài repo, quyền 0600, in khóa công khai", (t) => {
  const dir = temp(t);
  const keys = join(dir, "keys.json");
  writeFileSync(keys, JSON.stringify({ production: [{ kid: "prod-2026-10-1", x: "x" }] }));
  const inside = run("gen-manifest-key.mjs", ["prod-2026-10-2", "--out", resolve(REPO, "k.jwk"), "--keys", keys]);
  assert.equal(inside.status, 2);
  assert.match(inside.stderr, /không được nằm trong repo/);
  assert.equal(run("gen-manifest-key.mjs", ["prod-2026-10-1", "--out", join(dir, "a.jwk"), "--keys", keys]).status, 2, "kid đã có");
  assert.equal(run("gen-manifest-key.mjs", ["stg-2026-10-2", "--out", join(dir, "b.jwk"), "--keys", keys]).status, 2, "chỉ kid prod-");
  const ok = run("gen-manifest-key.mjs", ["prod-2026-10-2", "--out", join(dir, "c.jwk"), "--keys", keys]);
  assert.equal(ok.status, 0, ok.stderr);
  const pub = JSON.parse(ok.stdout);
  assert.equal(pub.kid, "prod-2026-10-2");
  assert.equal("d" in pub, false, "stdout không có khóa riêng");
  assert.match(ok.stderr, /khối "production"/);
  assert.equal(statSync(join(dir, "c.jwk")).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(join(dir, "c.jwk"), "utf8")).x, pub.x);
  assert.equal(run("gen-manifest-key.mjs", ["prod-2026-10-3", "--out", join(dir, "c.jwk"), "--keys", keys]).status, 2, "không ghi đè");
});

test("gen-manifest-key: kid đã có ở bất kỳ khối nào, kể cả khối cũ còn sót, đều bị từ chối", (t) => {
  const dir = temp(t);
  const keys = join(dir, "keys.json");
  writeFileSync(keys, JSON.stringify({ staging: [{ kid: "prod-2026-11-1", x: "x" }], production: [] }));
  const dup = run("gen-manifest-key.mjs", ["prod-2026-11-1", "--out", join(dir, "a.jwk"), "--keys", keys]);
  assert.equal(dup.status, 2);
  assert.match(dup.stderr, /đã có trong khối staging/);
});

test("gen-manifest-key: cờ --production cũ không còn được nhận (chỉ còn một môi trường)", (t) => {
  const dir = temp(t);
  const keys = join(dir, "keys.json");
  writeFileSync(keys, JSON.stringify({ production: [] }));
  const r = run("gen-manifest-key.mjs", ["prod-2026-11-2", "--production", "--out", join(dir, "a.jwk"), "--keys", keys]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Tham số/);
});

test("sign-manifest: chỉ ký bằng khóa có trong khối production, và tự kiểm lại", (t) => {
  const dir = temp(t);
  const keys = join(dir, "keys.json");
  writeFileSync(keys, JSON.stringify({ production: [] }));
  const made = run("gen-manifest-key.mjs", ["prod-2026-10-5", "--out", join(dir, "k.jwk"), "--keys", keys]);
  assert.equal(made.status, 0, made.stderr);
  const body = join(dir, "body.json");
  writeFileSync(body, JSON.stringify({ schema: 1, sequence: 2, files: [] }));
  const args = ["--key", join(dir, "k.jwk"), "--body", body, "--out", join(dir, "models.json"), "--keys", keys];
  const unknown = run("sign-manifest.mjs", args);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /không có trong khối production/);
  writeFileSync(keys, JSON.stringify({ production: [JSON.parse(made.stdout)] }));
  const signed = run("sign-manifest.mjs", args);
  assert.equal(signed.status, 0, signed.stderr);
  const envelope = JSON.parse(readFileSync(join(dir, "models.json"), "utf8"));
  assert.equal(envelope.kid, "prod-2026-10-5");
  assert.equal(envelope.format, "ai-translator-models");
});
```

1c. `scripts/release/signing.test.mjs`:
- dòng 73: `JSON.stringify({ staging: [], production })` → `JSON.stringify({ production })`.
- dòng 95 (stub `sign-manifest.mjs` giả): `JSON.stringify({ env: opt("--env"), key: opt("--key"),` → `JSON.stringify({ key: opt("--key"),`.
- dòng 107: `{ env: "production", key: undefined, mode: posixMode, content: '{"kid":"thử"}', sees: null }` → `{ key: undefined, mode: posixMode, content: '{"kid":"thử"}', sees: null }`.

- [ ] **Step 2: Chạy, thấy fail**

Run: `node --test scripts/models/manifest.test.mjs scripts/release/signing.test.mjs 2>&1 | tail -30`
Expected: FAIL ở các test mới (script còn tiền tố `stg`, khối `staging`, `--env`).

- [ ] **Step 3: Sửa `lib.mjs`**

Cũ:
```js
// Khóa công khai build sẵn vào app, của một môi trường (`staging` hay `production`).
export function builtInKeys(env, file = KEYS_FILE) {
  const all = JSON.parse(readFileSync(file, "utf8"));
  return all[env] ?? [];
}
```
Mới:
```js
// Khóa công khai build sẵn vào app: khối `production` (spec 2026-10-04: chỉ một môi trường).
export function builtInKeys(file = KEYS_FILE) {
  const all = JSON.parse(readFileSync(file, "utf8"));
  return all.production ?? [];
}
```

- [ ] **Step 4: Ghi đè `scripts/models/gen-manifest-key.mjs`**

```js
#!/usr/bin/env node
// Tạo cặp khóa Ed25519 ký manifest model (Đ8 của kế hoạch 00; kế hoạch 04, 07b; spec 2026-10-04: chỉ production).
// - Khóa riêng ghi ra file JWK ở --out: đường dẫn tuyệt đối, NGOÀI repo, chưa có file; quyền 0600. Không in ra terminal.
// - Khóa công khai `{ "kid", "x" }` in ra stdout, để thêm vào khối "production" trong src-tauri/keys/manifest-public-keys.json.
// - kid dạng prod-<năm>-<tháng>-<số thứ tự>. Chạy trên máy không nối mạng, --out trên USB, rồi mã hóa file bằng passphrase
//   và xóa bản rõ (docs/release/phat-hanh.md). Khóa này chỉ vào secret MANIFEST_SIGNING_KEY của environment `release`.
// - kid chưa có trong manifest-public-keys.json, ở bất kỳ khối nào (--keys để chỉ file khác).
//
//   node scripts/models/gen-manifest-key.mjs prod-2026-11-1 --out /Volumes/KHOA/manifest-prod-2026-11-1.jwk
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { webcrypto } from "node:crypto";
import { KEYS_FILE, insideRepo } from "./lib.mjs";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const [kid, ...rest] = process.argv.slice(2);
let out = null;
let keysFile = KEYS_FILE;
for (let i = 0; i < rest.length; i += 2) {
  if (rest[i] === "--out" && rest[i + 1]) out = rest[i + 1];
  else if (rest[i] === "--keys" && rest[i + 1]) keysFile = rest[i + 1];
  else fail("Tham số: <kid> --out <file JWK ngoài repo> [--keys <manifest-public-keys.json>]");
}
if (!kid || !/^prod-\d{4}-\d{2}-[1-9]\d{0,3}$/.test(kid)) {
  fail("kid phải dạng prod-<năm>-<tháng>-<số thứ tự>, ví dụ prod-2026-10-1.");
}
if (!out || !isAbsolute(out)) fail("--out phải là đường dẫn tuyệt đối.");
if (insideRepo(out)) fail("Khóa riêng không được nằm trong repo.");
if (existsSync(out)) fail(`${out} đã có; không ghi đè khóa cũ.`);
const known = JSON.parse(readFileSync(keysFile, "utf8"));
for (const [env, list] of Object.entries(known)) {
  if (Array.isArray(list) && list.some((k) => k?.kid === kid)) fail(`kid ${kid} đã có trong khối ${env}. Dùng số thứ tự mới.`);
}
const { privateKey } = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = await webcrypto.subtle.exportKey("jwk", privateKey);
mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
writeFileSync(out, JSON.stringify({ kty: "OKP", crv: "Ed25519", kid, d: jwk.d, x: jwk.x }), { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({ kid, x: jwk.x })}\n`);
console.error(`Đã ghi khóa riêng vào ${out} (0600). Thêm dòng trên vào khối "production" của ${keysFile}.`);
```

- [ ] **Step 5: Sửa `scripts/models/sign-manifest.mjs`**

5a. Phần chú thích đầu file (dòng 2-9).

Cũ:
```js
// Ký phần thân manifest model thành models.json (kế hoạch 04; Đ8 của kế hoạch 00: staging ký trên máy người vận hành
// bằng khóa ngoài repo; manifest production ký trong CI của kế hoạch 07).
// - --key: file JWK khóa riêng (gen-manifest-key.mjs), phải nằm ngoài repo và chỉ chủ file đọc được.
// - kid của khóa phải có trong khối --env (staging mặc định) của manifest-public-keys.json, đúng khóa công khai: app
//   bản tương ứng mới nhận manifest này.
// - Ký xong thì tự kiểm lại bằng khóa build sẵn rồi mới ghi --out.
//
//   node scripts/models/sign-manifest.mjs --key ~/.config/ai-translator/manifest-stg-2026-10-1.jwk --body body.json --out models.json
```
Mới:
```js
// Ký phần thân manifest model thành models.json (kế hoạch 04, 07a; spec 2026-10-04: chỉ production). Chạy trong CI
// (sign-manifest.yml, environment `release`) với khóa lấy từ secret MANIFEST_SIGNING_KEY.
// - --key: file JWK khóa riêng (gen-manifest-key.mjs), phải nằm ngoài repo và chỉ chủ file đọc được.
// - kid của khóa phải có trong khối production của manifest-public-keys.json, đúng khóa công khai: app mới nhận manifest này.
// - Ký xong thì tự kiểm lại bằng khóa build sẵn rồi mới ghi --out.
//
//   node scripts/models/sign-manifest.mjs --key /đường/dẫn/khóa.jwk --body body.json --out models.json
```

5b. Thân script.

Cũ:
```js
const env = opt("--env") ?? "staging";
const keysFile = opt("--keys") ?? KEYS_FILE;
if (!keyPath || !bodyPath || !outPath) fail("Tham số: --key <JWK> --body <phần thân> --out <models.json> [--env staging] [--keys <file>]");
```
Mới:
```js
const keysFile = opt("--keys") ?? KEYS_FILE;
if (!keyPath || !bodyPath || !outPath) fail("Tham số: --key <JWK> --body <phần thân> --out <models.json> [--keys <file>]");
```
Cũ: `const trusted = builtInKeys(env, keysFile);`
Mới: `const trusted = builtInKeys(keysFile);`
Cũ: ``if (!known) fail(`kid ${jwk.kid} không có trong khối ${env} của ${keysFile}: app sẽ không nhận manifest này.`);``
Mới: ``if (!known) fail(`kid ${jwk.kid} không có trong khối production của ${keysFile}: app sẽ không nhận manifest này.`);``

- [ ] **Step 6: Sửa `scripts/release/sign-manifest-ci.mjs`**

Dòng 13: `// `--env production` với môi trường không còn biến khóa, rồi xóa file khóa dù thành công hay lỗi. Ra:` → `// với môi trường không còn biến khóa, rồi xóa file khóa dù thành công hay lỗi. Ra:`; và dòng 12 `…chạy sign-manifest.mjs` giữ nguyên.

Dòng 65:

Cũ:
```js
      [script, "--env", "production", "--key", keyFile, "--body", join(root, env.BODY), "--out", out],
```
Mới:
```js
      [script, "--key", keyFile, "--body", join(root, env.BODY), "--out", out],
```

- [ ] **Step 7: Chạy**

Run: `node --test scripts/models/manifest.test.mjs scripts/release/signing.test.mjs 2>&1 | tail -15`
Expected: `fail 0`.

Run: `git grep -nE "staging|stg-|--env production|--production" -- scripts .github`
Expected: không dòng nào, trừ chuỗi `staging` có chủ ý trong test `kid đã có ở bất kỳ khối nào` (manifest.test.mjs) và dòng `gh secret set … --env release` (đó là môi trường GitHub `release`, không phải môi trường của app).

- [ ] **Step 8: Commit**

```bash
git add scripts/models scripts/release/sign-manifest-ci.mjs scripts/release/signing.test.mjs
git commit -m "$(cat <<'EOF'
refactor(scripts): khóa manifest chỉ có production, bỏ --env và --production

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Lệnh `no-dev-gate` của `release-check.mjs`

**Files:**
- Modify: `scripts/release/release-check.mjs` (hàm mới, lệnh mới, chú thích đầu file)
- Modify: `scripts/release/release-check.test.mjs`

- [ ] **Step 1: Viết test (red)**

Trong `scripts/release/release-check.test.mjs`, thêm `devGateErrors` và `DEV_GATE_MARKERS` vào danh sách import (theo thứ tự chữ cái):

```js
import {
  DEV_GATE_MARKERS,
  bundledName,
  checkBundle,
  checkSize,
  devGateErrors,
  embeddedErrors,
  ...
```

Thêm sau test `file chạy của app phải mang SHA-256 của mọi file…`:

```js
test("file chạy của app không được có mã công tắc dev (spec 2026-10-04, §3 lớp 3 và 4)", () => {
  assert.deepEqual(devGateErrors(Buffer.from("AI Translator 0.1.0, chạy bình thường")), []);
  assert.deepEqual(devGateErrors(Buffer.from("xx AI_TRANSLATOR_DEV_PRO yy")), [
    "file chạy của app còn mã dev: có chuỗi AI_TRANSLATOR_DEV_PRO",
  ]);
  assert.deepEqual(devGateErrors(Buffer.from("mt-dev-pro-gate-v1: bản debug")), [
    "file chạy của app còn mã dev: có chuỗi mt-dev-pro-gate-v1",
  ]);
  assert.equal(devGateErrors(Buffer.from("AI_TRANSLATOR_DEV_FREE")).length, 1, "tên biến cũ cũng bị chặn");
  assert.equal(devGateErrors(Buffer.from(DEV_GATE_MARKERS.join(" "))).length, DEV_GATE_MARKERS.length);
  // Windows có thể giữ chuỗi dạng UTF-16LE.
  assert.equal(devGateErrors(Buffer.from("AI_TRANSLATOR_DEV_PRO", "utf16le")).length, 1);
  // Chỉ khớp nguyên chuỗi: một phần tên biến không đủ.
  assert.deepEqual(devGateErrors(Buffer.from("AI_TRANSLATOR_DEV_")), []);
});

test("CLI no-dev-gate: file sạch không lỗi, file có chuỗi chim hoàng yến thì lỗi kèm tên file", (t) => {
  const dir = tempDir(t);
  const clean = join(dir, "clean");
  writeFileSync(clean, "abc");
  const dirty = join(dir, "dirty");
  writeFileSync(dirty, "...mt-dev-pro-gate-v1...");
  assert.deepEqual(main(["no-dev-gate", clean]), []);
  assert.deepEqual(main(["no-dev-gate", clean, dirty]), [
    "dirty: file chạy của app còn mã dev: có chuỗi mt-dev-pro-gate-v1",
  ]);
  assert.throws(() => main(["no-dev-gate"]), /thiếu file/);
});
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `node --test scripts/release/release-check.test.mjs 2>&1 | tail -15`
Expected: FAIL (`devGateErrors` không phải hàm được export; lỗi `SyntaxError: The requested module … does not provide an export named 'devGateErrors'`).

- [ ] **Step 3: Cài đặt**

Trong `scripts/release/release-check.mjs`:

3a. Chú thích đầu file, thêm sau khối `embedded` (trước `deps-macos`):

```js
//   node scripts/release/release-check.mjs no-dev-gate <file chạy của app>...
//       File chạy của app (bản phát hành) không có mã công tắc dev: tên biến AI_TRANSLATOR_DEV_PRO, tên biến cũ
//       AI_TRANSLATOR_DEV_FREE, chuỗi chim hoàng yến mt-dev-pro-gate-v1 (spec 2026-10-04, §3). Có một chuỗi là lỗi.
```

3b. Thêm ngay sau hàm `embeddedErrors`:

```js
/** Chuỗi chỉ có trong bản debug (công tắc Pro của dev, `src-tauri/src/pro.rs`): tên biến công tắc, tên biến cũ và chuỗi chim hoàng yến. */
export const DEV_GATE_MARKERS = ["AI_TRANSLATOR_DEV_PRO", "AI_TRANSLATOR_DEV_FREE", "mt-dev-pro-gate-v1"];

/** Lỗi khi file chạy của app (nội dung `binary`) còn mã công tắc dev. Quét cả UTF-8 lẫn UTF-16LE (chuỗi của Windows). */
export function devGateErrors(binary) {
  return DEV_GATE_MARKERS.filter(
    (marker) => binary.includes(Buffer.from(marker)) || binary.includes(Buffer.from(marker, "utf16le")),
  ).map((marker) => `file chạy của app còn mã dev: có chuỗi ${marker}`);
}
```

3c. Trong `main`, thêm `case` mới ngay sau `case "embedded"`:

```js
    case "no-dev-gate": {
      if (args.length === 0) throw new Error("thiếu file chạy của app");
      for (const file of args) {
        const found = devGateErrors(readFileSync(file));
        errors.push(...found.map((e) => `${basename(file)}: ${e}`));
        if (found.length === 0) console.log(`${basename(file)}: không có mã công tắc dev`);
      }
      break;
    }
```

- [ ] **Step 4: Chạy**

Run: `node --test scripts/release/release-check.test.mjs 2>&1 | tail -10`
Expected: `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/release-check.mjs scripts/release/release-check.test.mjs
git commit -m "$(cat <<'EOF'
feat(release): lệnh no-dev-gate chặn binary phát hành còn mã công tắc dev

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Gắn cổng vào đóng gói macOS và Windows

**Files:**
- Modify: `scripts/release/package-macos.sh` (dòng 84, 100)
- Modify: `scripts/release/package-windows.mjs` (import ở dòng 28; dòng 83, 90)

- [ ] **Step 1: macOS**

`scripts/release/package-macos.sh`: sau mỗi dòng `node "$check" embedded …` thêm một dòng. Có hai chỗ.

Chỗ 1 (pha `build`, sau `tauri build`, dòng 84):
```sh
  node "$check" embedded "$root/src-tauri/binaries" "$app/Contents/MacOS/meeting-translator" --target "$triple"
  node "$check" no-dev-gate "$app/Contents/MacOS/meeting-translator"
```
Chỗ 2 (pha `sign`, trước `mkdir -p "$out"`, dòng 100):
```sh
node "$check" embedded "$root/src-tauri/binaries" "$app/Contents/MacOS/meeting-translator" --target "$triple"
node "$check" no-dev-gate "$app/Contents/MacOS/meeting-translator"
```
(Thụt lề của chỗ 1 là hai dấu cách, vì nó nằm trong khối `if`.) Thêm một dòng chú thích phía trên chỗ 2: `# Cổng chống Pro trái phép (spec 2026-10-04, §3): app đã build ở job khác cũng phải sạch mã công tắc dev trước khi ký.`

- [ ] **Step 2: Windows**

`scripts/release/package-windows.mjs`:

Dòng 28:

Cũ: `import { checkBundle, checkSize, embeddedErrors, sha256File, sidecarTable } from "./release-check.mjs";`
Mới: `import { checkBundle, checkSize, devGateErrors, embeddedErrors, sha256File, sidecarTable } from "./release-check.mjs";`

Hai chỗ gọi `embeddedErrors` (dòng 83 và 90): thêm dòng ngay sau mỗi chỗ.

Chỗ 1:
```js
    errors.push(...embeddedErrors(readFileSync(exe), sidecarTable(binaries, TRIPLE)));
    errors.push(...devGateErrors(readFileSync(exe)));
    if (phase === "build" || errors.length > 0) return errors;
```
Chỗ 2:
```js
    errors.push(...embeddedErrors(readFileSync(exe), sidecarTable(binaries, TRIPLE)));
    errors.push(...devGateErrors(readFileSync(exe)));
    if (errors.length > 0) return errors;
```

- [ ] **Step 3: Chạy**

Run: `sh -n scripts/release/package-macos.sh && echo "cú pháp sh hợp lệ"`
Expected: `cú pháp sh hợp lệ`.

Run: `node --check scripts/release/package-windows.mjs && echo "cú pháp js hợp lệ"`
Expected: `cú pháp js hợp lệ`.

Run: `node --test "scripts/release/*.test.mjs" 2>&1 | tail -10`
Expected: `fail 0`.

Run: `grep -c "no-dev-gate" scripts/release/package-macos.sh; grep -c "devGateErrors" scripts/release/package-windows.mjs`
Expected: `2` và `3` (một import cộng hai chỗ gọi).

- [ ] **Step 4: Commit**

```bash
git add scripts/release/package-macos.sh scripts/release/package-windows.mjs
git commit -m "$(cat <<'EOF'
ci(release): đóng gói macOS và Windows chạy cổng no-dev-gate trước khi ký

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Tài liệu phát hành (`docs/release/phat-hanh.md`)

**Files:**
- Modify: `docs/release/phat-hanh.md` (dòng 42, 61-62, 67)

- [ ] **Step 1: Sửa ba chỗ**

Dòng 42:

Cũ: `node scripts/models/gen-manifest-key.mjs prod-<năm>-<tháng>-1 --production --out /Volumes/KHOA-RAM/manifest.jwk`
Mới: `node scripts/models/gen-manifest-key.mjs prod-<năm>-<tháng>-1 --out /Volumes/KHOA-RAM/manifest.jwk`

Dòng 61-62:

Cũ:
```
- Hai bucket R2: một cho staging, một cho production (ví dụ `ai-translator-releases`), mỗi bucket có tên miền công khai
  (production: `releases.<tên miền>` khi có T7, trước đó là URL `r2.dev` của bucket).
```
Mới:
```
- Một bucket R2 production (ví dụ `ai-translator-releases`) có tên miền công khai (`releases.<tên miền>` khi có T7, trước
  đó là URL `r2.dev` của bucket). Không có bucket staging (spec 2026-10-04: chỉ một môi trường).
```

Dòng 67:

Cũ: `  - `src-tauri/src/updater/source.rs`: `PRODUCTION_URL` đúng bằng `RELEASES_BASE_URL`; `STAGING_URL` là URL của bucket staging.`
Mới: `  - `src-tauri/src/updater/source.rs`: `PRODUCTION_URL` đúng bằng `RELEASES_BASE_URL`.`

- [ ] **Step 2: Thêm mục kiểm cổng no-dev-gate**

Ngay sau dòng `- Kiểm: `node scripts/release/release-ready.mjs --base-url …` … dừng nếu còn thiếu.` (cuối mục 1.3), thêm đoạn:

```
- Cổng chống Pro trái phép: `package-macos.sh` và `package-windows.mjs` chạy `node scripts/release/release-check.mjs
  no-dev-gate <file chạy của app>` sau bước `embedded`. File có chuỗi `AI_TRANSLATOR_DEV_PRO`, `AI_TRANSLATOR_DEV_FREE`
  hay `mt-dev-pro-gate-v1` thì job đỏ, không ký, không đăng (spec 2026-10-04, §3). Gặp lỗi này thì bản đang build là bản
  debug hoặc `[profile.release]` đã bật `debug-assertions`: kiểm `Cargo.toml` rồi build lại, đừng tắt cổng.
```

- [ ] **Step 3: Kiểm**

Run: `git grep -nE -- "staging|STAGING|--production|\bstg\b" -- docs/release`
Expected: không dòng nào.

- [ ] **Step 4: Commit**

```bash
git add docs/release/phat-hanh.md
git commit -m "$(cat <<'EOF'
docs(release): chỉ một bucket và một môi trường, thêm cổng no-dev-gate

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Sửa spec gốc, spec mới và `CLAUDE.md`

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
- Modify: `docs/superpowers/specs/2026-10-04-single-production-environment-design.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Spec gốc. Mười sáu chỗ (dùng `grep -n` để định vị, rồi sửa đúng chuỗi)**

Run: `grep -nE "staging|\bstg\b|mt-license-<env>|ngoài môi trường dev|môi trường test|<môi trường>-<năm>|theo môi trường và theo ô|từng môi trường" docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md | cut -c1-90`
Expected: danh sách các dòng dưới đây (số dòng có thể lệch vài đơn vị, tìm theo chuỗi).

| # | Tìm (cũ) | Thay bằng (mới) |
|---|---|---|
| 1 | `tên Worker của license server (`mt-license-<env>`)` | `tên Worker của license server (`mt-license`, `mt-license-admin`)` |
| 2 | `**Khóa:** bản dev chỉ nhận khóa staging, bản phát hành chỉ nhận khóa production (§10.2, "Khóa ký manifest và bản cập nhật"). App nhúng một khóa công khai cho mỗi môi trường;` | `**Khóa:** mọi bản build, kể cả bản dev, chỉ nhận khóa production (§10.2, "Khóa ký manifest và bản cập nhật"; §6.13). App nhúng khóa công khai production;` |
| 3 | `biến cấu hình `PLANS` của từng môi trường:` | `biến cấu hình `PLANS` (một môi trường, production, §6.13):` |
| 4 | `Môi trường chưa cấu hình `PLANS` thì` | `Server chưa cấu hình `PLANS` thì` |
| 5 | ` Staging dùng giá thử nhỏ (kế hoạch 05).` | (xóa câu này) |
| 6 | `Mọi route chỉ nhận HTTPS (ngoài môi trường dev).` | `Mọi route chỉ nhận HTTPS.` |
| 7 | `- **Dải số đơn theo môi trường:**` | `- **Dải số đơn:**` |
| 8 | `  - staging dùng `order_code` từ 1 tới 999.999; production từ 1.000.001. Hai môi trường không trùng số, kể cả khi dùng chung một kênh PayOS;` | `  - production bắt đầu từ `order_code` 1.000.001 (giữ nguyên từ trước; spec 2026-10-04 bỏ dải 1–999.999 của staging);` |
| 9 | `dạng `<môi trường>-<năm>-<tháng>-<số thứ tự>`, ví dụ `prod-2026-10-1`` | `dạng `prod-<năm>-<tháng>-<số thứ tự>`, ví dụ `prod-2026-10-1`` |
| 10 | `(ví dụ `stg-2026-10-1` ở ô A, `stg-2026-10-2` ở ô B)` | `(ví dụ `prod-2026-10-1` ở ô A, `prod-2026-10-2` ở ô B)` |
| 11 | `ghi theo môi trường và theo ô, và được build sẵn vào app.` | `ghi theo ô (khối `production`), và được build sẵn vào app.` |
| 12 | cả dòng `- Khóa staging của manifest nằm ngoài repo, trên máy người vận hành (file JWK quyền 0600), vì staging chưa có CI; bản phát hành không bao giờ nhận khóa staging.` | (xóa dòng) |
| 13 | `  - Test tích hợp với PayOS trên môi trường test nếu có; nếu không có thì dùng giao dịch với số tiền nhỏ.` | `  - Test tích hợp với PayOS: PayOS không có sandbox, nên thử bằng giao dịch giá thật rồi hoàn tiền tay trên production, trước khi nhúng URL vào app (§6.13).` |
| 14 | `Kiểm ngày 2026-10-01: PayOS không có sandbox, nên test bằng giao dịch nhỏ trên staging.` | `Kiểm ngày 2026-10-01: PayOS không có sandbox, nên test bằng giao dịch thật trên production trước phát hành (§6.13).` |
| 15 | `Kiểm bằng giao dịch thật trên staging (kế hoạch 05, Task 20)` | `Kiểm bằng giao dịch thật trên production trước phát hành (kế hoạch 05, Task 21)` |
| 16 | `Trong lúc chờ, staging dùng `*.workers.dev` và URL tạm của R2` | `Trong lúc chờ, production dùng `*.workers.dev` và URL tạm của R2` |

Ngoài bảng:
- Xóa cả dòng `- **Kênh PayOS cho staging** (P05-1 của kế hoạch Giai đoạn 1 · 05): …` ở §15.
- Dòng `**Hộp thư nhận cảnh báo vận hành** … Cần có trước khi triển khai staging.`: đổi `triển khai staging` thành `triển khai production`.

- [ ] **Step 2: Spec gốc, thêm §6.13**

Ngay trước dòng `## 7. Luồng xử lý, đa luồng và chống nghẽn`, thêm:

```
### 6.13 Môi trường

Chỉ có một môi trường, **production** (spec `2026-10-04-single-production-environment-design.md`, thay mọi chỗ của spec này nói tới staging hay dev của server). Mọi bản build của app, kể cả bản debug chạy ở máy dev, nối vào license server, khóa công khai, manifest model và nguồn cập nhật production.

Bản debug chỉ khác ở ba khả năng của build, không phải của môi trường: không kiểm chữ ký bản cài, không tự cập nhật, và có công tắc `AI_TRANSLATOR_DEV_PRO=true` (Pro giả lập, đặt trong `.env` do `scripts/run-dev-app.sh` đọc). Công tắc không có trong bản phát hành, kể cả mã đọc nó; CI chặn nếu nó lọt vào. Mặc định bản dev đi đường thật: dev kích hoạt Pro như người dùng thật.
```

- [ ] **Step 3: Spec gốc, đầu tài liệu**

Trong khối `**Trạng thái:**` thêm một bullet cuối: `- Sửa ngày 2026-10-04: chỉ còn một môi trường production (§6.13, spec `2026-10-04-single-production-environment-design.md`); các chỗ nói staging hay dev của server đã được sửa theo.`

- [ ] **Step 4: Spec mới, đối chiếu với code**

Run: `grep -nE "LICENSE_URL|Trạng thái app thêm|Bỏ biến .ENVIRONMENT|luôn bắt buộc|bỏ tham số và nhánh staging|biến ghi đè URL manifest|Chưa có kế hoạch" docs/superpowers/specs/2026-10-04-single-production-environment-design.md | cut -c1-80`

Sửa trong `docs/superpowers/specs/2026-10-04-single-production-environment-design.md`:

| # | Tìm (cũ) | Thay bằng (mới) |
|---|---|---|
| 1 | `Chưa có kế hoạch thực hiện.` | `Kế hoạch thực hiện: `docs/superpowers/plans/2026-10-04-mot-moi-truong-01-app.md`, `-02-server.md`, `-03-script-ci-tai-lieu.md`. Ngày 2026-10-04, sau khi đọc hết code, spec được sửa ba chỗ (xem dưới).` |
| 2 | `Bỏ `AI_TRANSLATOR_LICENSE_URL` và biến ghi đè URL manifest model.` | `Bỏ ba biến ghi đè URL: `AI_TRANSLATOR_LICENSE_URL`, `AT_MODELS_URL` (manifest model) và `AI_TRANSLATOR_UPDATE_URL` (bản cập nhật).` |
| 3 | `Còn một hằng `LICENSE_URL: Option<&str>`` | `Còn một hằng `PRODUCTION_URL: Option<&str>` (giữ tên này vì `release-ready.mjs` tìm đúng dòng đó)` |
| 4 | `- Trạng thái app thêm trường `devPro: bool`. Bản release luôn là `false` do biên dịch. Giao diện hiện nhãn **"DEV · Pro giả lập"** khi `true`, và app ghi một dòng log mức cảnh báo lúc khởi động.` | `- Giao diện dùng lại trường `devOverride` của `LicenseView` (đã có từ kế hoạch 06; bản release luôn `false` do biên dịch) để hiện nhãn **"DEV · Pro giả lập"** ở Cài đặt › Bản quyền, và app ghi một dòng log mức cảnh báo lúc khởi động (kèm chuỗi chim hoàng yến).` |
| 5 | `- Bỏ biến `ENVIRONMENT` khỏi `ApiEnv` và `AdminEnv`. Mọi chỗ đang rẽ nhánh theo nó (kiểm `ACCESS_AUD`, dải `order_code`, ghi log, cảnh báo) đổi thành hành vi production cố định. Kế hoạch thực hiện liệt kê từng chỗ dùng.` | `- `ENVIRONMENT` chỉ còn hai giá trị: `production` (cố định trong `wrangler*.jsonc`) và `test` (chỉ `vitest.config.ts` ghi đè, để nới ba chỗ cho test: chỉ HTTPS, khóa ký `test-*`, `ACCESS_AUD` bắt buộc). Một test Node khóa việc file wrangler luôn là `production`. Dải `order_code` theo môi trường bị bỏ.` |
| 6 | `- `ACCESS_AUD` của Worker admin **luôn bắt buộc**: trống thì mọi request bị 403.` | `- `ACCESS_AUD` của Worker admin **luôn bắt buộc** (trừ `ENVIRONMENT=test`): trống thì mọi request bị 403.` |
| 7 | `: bỏ tham số và nhánh staging.` | `: bỏ tham số `--env`, cờ `--production` và nhánh staging (kid luôn `prod-…`).` |
| 8 | `Hiện `LICENSE_URL` là `None`` | `Hiện `PRODUCTION_URL` là `None`` |

Và ở §3 hàng "4. Cổng CI trước khi ký": thêm vào cuối ô: ` Lệnh là `release-check.mjs no-dev-gate`, gắn vào `package-macos.sh` và `package-windows.mjs` sau bước `embedded`.`

- [ ] **Step 5: `CLAUDE.md`**

Thêm một bullet vào cuối danh sách đầu file (sau dòng "Mốc benchmark chọn model"):

```
- **Môi trường:** chỉ có production; bản dev (debug) cũng nối production. Công tắc Pro của dev (`AI_TRANSLATOR_DEV_PRO=true` trong `.env`, chỉ bản debug) và các lớp chống lọt vào bản phát hành: `docs/superpowers/specs/2026-10-04-single-production-environment-design.md`. Không thêm lại staging hay biến ghi đè URL.
```

- [ ] **Step 6: Kiểm**

Run: `git grep -niE "staging|\bstg\b" -- CLAUDE.md docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md docs/superpowers/specs/2026-10-04-single-production-environment-design.md`
Expected: chỉ còn các dòng có chủ ý: nhắc "staging" để nói nó đã bị bỏ (mục 1.1 của spec mới, §6.13, `Bỏ dải 1–999.999 của staging`), và các câu "không còn staging". Dòng nào dạy dùng staging thì sửa.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(spec): sửa spec gốc và spec mới cho khớp một môi trường production, cập nhật CLAUDE.md

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Kiểm toàn bộ đợt (chạy sau khi kế hoạch 01 và 02 xong)

**Files:** không sửa file (trừ khi có lỗi).

- [ ] **Step 1: Test Node toàn bộ**

Run: `node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/dev-env.test.mjs 2>&1 | tail -12`
Expected: `fail 0`.

Run: `cd server && pnpm check 2>&1 | tail -15; cd ..`
Expected: `pnpm check` thoát mã 0.

- [ ] **Step 2: Test Rust và giao diện**

Run: `cargo fmt --all -- --check && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | tail -6`
Expected: không lỗi, không cảnh báo.

Run: `cargo test --locked --workspace 2>&1 | tail -10`
Expected: mọi `test result: ok.`

Run: `pnpm build 2>&1 | tail -4 && pnpm test 2>&1 | tail -6`
Expected: build thành công, vitest đạt hết.

- [ ] **Step 3: Cổng no-dev-gate bắt đúng, không bắt nhầm**

Run: `cargo build -p meeting-translator 2>&1 | tail -3`
Expected: `Finished`.

Run: `node scripts/release/release-check.mjs no-dev-gate target/debug/meeting-translator; echo "exit=$?"`
Expected: `LỖI: meeting-translator: file chạy của app còn mã dev: có chuỗi AI_TRANSLATOR_DEV_PRO` (và dòng cho `mt-dev-pro-gate-v1`), `exit=1`. Đây chứng minh cổng có thể bắt được bản debug.

Run: `cargo build --release -p meeting-translator 2>&1 | tail -3`
Expected: `Finished` (cần `pnpm build` ở trên để có `dist/`; nếu thiếu `src-tauri/binaries/` thì `cp` tạm hoặc chạy `scripts/copy-sidecars.sh` như `docs/release/phat-hanh.md` hướng dẫn).

Run: `node scripts/release/release-check.mjs no-dev-gate target/release/meeting-translator; echo "exit=$?"`
Expected: `meeting-translator: không có mã công tắc dev`, `exit=0`.

Run: `strings target/release/meeting-translator | grep -cE "AI_TRANSLATOR_DEV_PRO|AI_TRANSLATOR_DEV_FREE|mt-dev-pro-gate-v1"`
Expected: `0`.

- [ ] **Step 4: Bản release không bị công tắc đổi (nghiệm thu thủ công, cần macOS, báo trước)**

Chạy `target/release/meeting-translator` với `AI_TRANSLATOR_DEV_PRO=true` trong môi trường: app vẫn ở gói Free, không có nhãn "DEV · Pro giả lập". (Bản này không ký nên `genuine` bỏ qua hay báo không chính hãng tùy cấu hình; điều cần xem là Pro vẫn khóa.)

- [ ] **Step 5: Quét toàn repo**

Run: `git grep -niE "staging|\bstg\b|AI_TRANSLATOR_(LICENSE|UPDATE)_URL|AT_MODELS_URL|DEV_FREE|mt-license-(dev|staging)" -- . ':!bench' ':!third_party' ':!docs/superpowers/plans' ':!pnpm-lock.yaml' ':!Cargo.lock' ':!node_modules' ':!server/node_modules' ':!target' | grep -vE "docs/superpowers/specs/2026-10-04|docs/superpowers/specs/2026-09-29"`
Expected: chỉ các dòng có chủ ý (chuỗi `staging` trong test chứng minh khối cũ bị bỏ qua: `license/keys.rs`, `models/signed.rs`, `updater/source.rs`, `scripts/models/manifest.test.mjs`, `scripts/release/release-check.mjs` quét `AI_TRANSLATOR_DEV_FREE`). Còn dòng khác thì sửa.

Các kế hoạch cũ trong `docs/superpowers/plans/` (trước 2026-10-04) cố ý không viết lại.

- [ ] **Step 6: Báo kết quả**

Không commit gì thêm nếu mọi bước sạch. Báo lại cho chủ dự án: số test mỗi lệnh; kết quả Step 3 và 4; và nhắc ba việc còn mở của spec mục 7 (chưa có server production, `PRODUCTION_URL` còn `None`, dev ghi dữ liệu thật khi không bật công tắc).

---

## Tự rà soát (đối chiếu spec)

| Yêu cầu của spec | Task |
|---|---|
| §3 lớp 3 (chuỗi chim hoàng yến) và lớp 4 (cổng CI, có test) | 2, 3 (chuỗi nằm ở kế hoạch 01 Task 1) |
| §5 script khóa manifest: bỏ staging, `--env`, `--production` | 1 |
| §5 `release-ready.mjs` giữ kiểm đủ khóa production | không đổi (hằng `PRODUCTION_URL` giữ tên) |
| §5 `docs/release/phat-hanh.md` | 4 |
| §5 sửa spec gốc, thêm mục "Môi trường" | 5 (Step 1-3, §6.13) |
| §5 `CLAUDE.md` | 5 |
| §5 bỏ khóa `stg-2026-10-1` | kế hoạch 01 Task 4 |
| §6 nghiệm thu 3 (`strings` trên binary release) | 6 Step 3, 4 |
| §6 test `release-check.test.mjs` | 2 |
| §7 rủi ro, việc còn mở | 6 Step 6 (nhắc) |

Phần không thuộc kế hoạch này: mã app (kế hoạch 01), server (kế hoạch 02).
