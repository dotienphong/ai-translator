# Phiên bản website tự theo bản đã đăng · Kế hoạch thực thi

**Trạng thái:** chưa làm. Làm trực tiếp trên `main` theo lời chủ dự án (2026-10-13). Task 0–4 không cần phép riêng; **Task 6 (đẩy tag phát hành) cần chủ dự án xác nhận lại ngay trước khi đẩy.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** `SITE.version` và `SITE.releaseDate` của website không còn gõ tay: build/test lấy từ `tauri.conf.json`, `pnpm deploy` lấy từ bản đã đăng trên R2. Sau đó nâng app lên 0.1.8, push và phát hành.

**Kiến trúc:** module mới `website/src/release.mjs` (hàm thuần + một hàm nối `resolveRelease`); `site.mjs` nạp nó bằng top-level await; cờ `--deploy` trong script `deploy` của website bật chế độ đọc R2. Không đụng `release.yml`.

**Công nghệ:** Node 24 thuần (`node:test`, `fetch`, `Intl`), không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-10-13-website-version-tu-dong-design.md` (chủ dự án duyệt 2026-10-13).

## Quy ước chung

- Thư mục `/Users/dtphong/Desktop/software_business/ai-translator`, nhánh `main`. Shell **reset thư mục sau mỗi lệnh**: gắn `cd /Users/dtphong/Desktop/software_business/ai-translator &&` vào đầu mọi lệnh.
- File chưa theo dõi `docs/superpowers/specs/2026-10-11-doc-to-ban-dich-research.md` là của phiên khác: **không commit, không `git add -A`**. Mỗi commit chỉ `git add` đúng file của task.
- Commit kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (HEREDOC). Push `main` đã được chủ dự án cho phép ở Task 5; không đụng nhánh khác.
- Test website: `cd website && node --test test/release.test.mjs` cho file mới; cả bộ: `cd website && pnpm test` (khoảng 70 giây, 2 test bỏ qua là bình thường).
- Không dùng `\uXXXX` trong code của kế hoạch này (công cụ ghi file đổi chúng thành ký tự thật).

---

## Task 0: Chuẩn bị (không commit)

- [ ] **Bước 1: Nhánh và cây làm việc**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short && git log --oneline -3
```

Kỳ vọng: `main`; chỉ có `?? docs/superpowers/specs/2026-10-11-doc-to-ban-dich-research.md` (và file kế hoạch này nếu chưa commit); `git log` có `770fb79 docs(spec): phiên bản và ngày phát hành của website…`.

- [ ] **Bước 2: Baseline test website**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (pass|fail|skipped)|✖" | head -8
```

Kỳ vọng: đúng 1 test đỏ, `JSON-LD: … version khớp bản phát hành` với `'0.1.6' !== '0.1.7'` (lỗi có sẵn mà kế hoạch này sửa tận gốc).

---

## Task 1: Hàm thuần của `release.mjs` (test trước)

**Files:**
- Create: `website/test/release.test.mjs`
- Create: `website/src/release.mjs`

- [ ] **Bước 1: Viết test (file mới)**

Tạo `website/test/release.test.mjs`:

```js
// Phiên bản và ngày phát hành của website (spec 2026-10-13-website-version-tu-dong-design.md): chạy `node --test test/release.test.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, deployRelease, previewRelease, vnDate } from "../src/release.mjs";

test("vnDate: ngày theo giờ Việt Nam (UTC+7) của một thời điểm ISO", () => {
  assert.equal(vnDate("2026-10-12T10:36:23Z"), "2026-10-12");
  assert.equal(vnDate("2026-10-12T16:59:59Z"), "2026-10-12");
  assert.equal(vnDate("2026-10-12T17:00:00Z"), "2026-10-13", "17:00 UTC đã sang ngày hôm sau ở Việt Nam");
});

test("vnDate: chuỗi không phải thời điểm ISO thì null", () => {
  for (const bad of ["hôm qua", "2026-10-12", "", undefined, null, 20261012]) assert.equal(vnDate(bad), null, String(bad));
});

test("compareVersions: so số, không so chuỗi; bản beta nhỏ hơn bản stable cùng số", () => {
  assert.equal(compareVersions("0.1.8", "0.1.7"), 1);
  assert.equal(compareVersions("0.1.7", "0.1.7"), 0);
  assert.equal(compareVersions("0.1.7", "0.1.10"), -1);
  assert.equal(compareVersions("0.2.0", "0.1.99"), 1);
  assert.equal(compareVersions("0.1.9-beta.1", "0.1.9"), -1);
  assert.equal(compareVersions("0.1.9-beta.2", "0.1.9-beta.10"), -1);
  assert.throws(() => compareVersions("0.1", "0.1.7"), /không phải phiên bản/);
});

test("previewRelease: version của tauri.conf.json; ngày là ngày commit nâng bản, thiếu thì hôm nay", () => {
  assert.deepEqual(previewRelease({ confVersion: "0.1.8", gitDate: "2026-10-12", today: "2026-10-13" }), {
    version: "0.1.8",
    releaseDate: "2026-10-12",
  });
  assert.deepEqual(previewRelease({ confVersion: "0.1.8", gitDate: null, today: "2026-10-13" }), {
    version: "0.1.8",
    releaseDate: "2026-10-13",
  });
  // Chỉ xem trước: bản beta vẫn dựng được (deploy mới đòi bản stable của R2).
  assert.equal(previewRelease({ confVersion: "0.1.9-beta.1", gitDate: null, today: "2026-10-13" }).version, "0.1.9-beta.1");
});

const latest = (version, pub_date = "2026-10-12T10:36:23Z") => ({ version, pub_date, notes: "", platforms: {} });

test("deployRelease: dùng version và ngày của R2 khi R2 bằng hoặc thấp hơn repo", () => {
  const expected = { version: "0.1.7", releaseDate: "2026-10-12" };
  assert.deepEqual(deployRelease({ confVersion: "0.1.7", latest: latest("0.1.7") }), expected);
  // Giữa lúc nâng bản và lúc đăng: repo đã 0.1.8, R2 còn 0.1.7 → website nói bản đã phát hành thật.
  assert.deepEqual(deployRelease({ confVersion: "0.1.8", latest: latest("0.1.7") }), expected);
});

test("deployRelease: R2 cao hơn repo thì dừng (máy chưa git pull)", () => {
  assert.throws(() => deployRelease({ confVersion: "0.1.7", latest: latest("0.1.8") }), /0\.1\.8 mới hơn repo \(0\.1\.7\).*git pull/s);
  // Repo ở bản beta của chính số đó cũng cũ hơn bản stable đã đăng.
  assert.throws(() => deployRelease({ confVersion: "0.1.9-beta.1", latest: latest("0.1.9") }), /mới hơn repo/);
  assert.deepEqual(deployRelease({ confVersion: "0.1.9-beta.1", latest: latest("0.1.8") }), { version: "0.1.8", releaseDate: "2026-10-12" });
});

test("deployRelease: dữ liệu lạ của R2 thì dừng, nói rõ lý do", () => {
  const conf = "0.1.8";
  assert.throws(() => deployRelease({ confVersion: conf, latest: latest("0.1.8-beta.1") }), /chỉ nhận X\.Y\.Z/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: latest("latest") }), /chỉ nhận X\.Y\.Z/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: {} }), /chỉ nhận X\.Y\.Z/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: null }), /chỉ nhận X\.Y\.Z/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: latest("0.1.7", "hôm qua") }), /pub_date/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: { version: "0.1.7" } }), /pub_date/);
});
```

- [ ] **Bước 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/release.test.mjs 2>&1 | grep -E "Cannot find|ERR_MODULE|ℹ (pass|fail)" | head -4
```

Kỳ vọng: lỗi không tìm thấy `../src/release.mjs`.

- [ ] **Bước 3: Viết `website/src/release.mjs` (phần hàm thuần)**

```js
// Phiên bản và ngày phát hành của website (spec 2026-10-13-website-version-tu-dong-design.md). Không gõ tay: chế độ xem
// trước (pnpm build, dev, test) lấy từ src-tauri/tauri.conf.json; chế độ deploy (cờ --deploy của pnpm deploy) lấy từ bản đã
// đăng trên R2, vì website chỉ được nói điều có thật.

export const RELEASES_URL = "https://releases.aitranslator.io.vn";

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Ngày `YYYY-MM-DD` theo giờ Việt Nam của một thời điểm ISO (UTC+7); null khi không phải thời điểm ISO. */
export function vnDate(iso) {
  if (typeof iso !== "string" || !ISO_INSTANT.test(iso)) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** So hai phiên bản X.Y.Z hay X.Y.Z-beta.N: -1, 0 hay 1 (bản beta nhỏ hơn bản stable cùng số). Sai dạng thì ném lỗi. */
export function compareVersions(a, b) {
  const parse = (text) => {
    const m = VERSION.exec(text);
    if (!m) throw new Error(`${JSON.stringify(text)} không phải phiên bản X.Y.Z hay X.Y.Z-beta.N`);
    return { n: [+m[1], +m[2], +m[3]], beta: m[4] === undefined ? null : +m[4] };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1;
  if (x.beta === y.beta) return 0;
  if (x.beta === null) return 1;
  if (y.beta === null) return -1;
  return x.beta < y.beta ? -1 : 1;
}

/** Chế độ xem trước: version của tauri.conf.json; ngày là ngày commit nâng bản (`gitDate`), thiếu thì `today`. */
export function previewRelease({ confVersion, gitDate, today }) {
  return { version: confVersion, releaseDate: gitDate ?? today };
}

/**
 * Chế độ deploy: version và ngày của bản stable đã đăng (`latest` là stable/latest.json). Dừng khi dữ liệu lạ, hay khi R2 có
 * bản mới hơn repo (máy chưa git pull: deploy lúc đó làm mất nội dung). R2 thấp hơn repo là bình thường (đã nâng bản, chưa
 * đăng): website vẫn nói bản đã phát hành thật.
 */
export function deployRelease({ confVersion, latest }) {
  const version = latest?.version;
  if (typeof version !== "string" || !STABLE.test(version)) {
    throw new Error(`stable/latest.json có version ${JSON.stringify(version)}: kênh stable chỉ nhận X.Y.Z`);
  }
  const releaseDate = vnDate(latest.pub_date);
  if (!releaseDate) throw new Error(`stable/latest.json có pub_date ${JSON.stringify(latest.pub_date)} không hợp lệ`);
  if (compareVersions(version, confVersion) > 0) {
    throw new Error(`R2 đã có bản ${version} mới hơn repo (${confVersion}): git pull rồi deploy lại`);
  }
  return { version, releaseDate };
}
```

- [ ] **Bước 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/release.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)|✖"
```

Kỳ vọng: `ℹ pass 7`, `ℹ fail 0`.

- [ ] **Bước 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add website/src/release.mjs website/test/release.test.mjs && git commit -q -m "$(cat <<'EOF'
feat(website): hàm tính phiên bản và ngày phát hành từ tauri.conf.json hoặc bản đã đăng trên R2

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

## Task 2: `fetchStableLatest`, `gitCommitDate`, `resolveRelease` (test trước)

**Files:**
- Modify: `website/test/release.test.mjs`
- Modify: `website/src/release.mjs`

- [ ] **Bước 1: Thêm test**

Trong `website/test/release.test.mjs`, thay dòng import:

```js
import { compareVersions, deployRelease, previewRelease, vnDate } from "../src/release.mjs";
```

bằng:

```js
import { readFileSync } from "node:fs";
import {
  RELEASES_URL,
  compareVersions,
  deployRelease,
  fetchStableLatest,
  gitCommitDate,
  previewRelease,
  resolveRelease,
  vnDate,
} from "../src/release.mjs";
```

và thêm vào cuối file:

```js
const jsonResponse = (status, body) => ({ status, json: async () => body });

test("fetchStableLatest: đọc stable/latest.json của R2 (15 giây là hạn chót)", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    return jsonResponse(200, latest("0.1.7"));
  };
  assert.deepEqual(await fetchStableLatest(fetchImpl), latest("0.1.7"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], `${RELEASES_URL}/stable/latest.json`);
  assert.ok(calls[0][1].signal instanceof AbortSignal, "có hạn chót để không treo deploy");
});

test("fetchStableLatest: lỗi mạng, mã khác 200, hay không phải JSON thì ném lỗi nói rõ và không cho deploy", async () => {
  await assert.rejects(fetchStableLatest(async () => { throw new Error("ENOTFOUND"); }), /không đọc được .*stable\/latest\.json.*ENOTFOUND.*không deploy/s);
  await assert.rejects(fetchStableLatest(async () => jsonResponse(404, {})), /mã 404.*không deploy/s);
  await assert.rejects(
    fetchStableLatest(async () => ({ status: 200, json: async () => { throw new SyntaxError("x"); } })),
    /không phải JSON/,
  );
});

test("gitCommitDate: ngày commit gần nhất đổi dòng version của tauri.conf.json trong repo này; ngoài repo thì null", () => {
  assert.match(gitCommitDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(gitCommitDate({ cwd: "/không/có/thư/mục/này" }), null);
});

const stubs = { readConf: () => ({ version: "0.1.8" }), gitDate: () => "2026-10-12", today: () => "2026-10-13" };

test("resolveRelease: xem trước không gọi mạng", async () => {
  const fetchLatest = async () => { throw new Error("không được gọi mạng ở chế độ xem trước"); };
  assert.deepEqual(await resolveRelease({ ...stubs, deploy: false, fetchLatest }), { version: "0.1.8", releaseDate: "2026-10-12" });
});

test("resolveRelease: deploy gọi R2 đúng một lần và dùng giá trị của nó", async () => {
  let n = 0;
  const fetchLatest = async () => { n += 1; return latest("0.1.7"); };
  assert.deepEqual(await resolveRelease({ ...stubs, deploy: true, fetchLatest }), { version: "0.1.7", releaseDate: "2026-10-12" });
  assert.equal(n, 1);
});

test("resolveRelease: deploy không đọc được R2 thì ném lỗi (không có website nói bừa)", async () => {
  const fetchLatest = async () => { throw new Error("mất mạng"); };
  await assert.rejects(resolveRelease({ ...stubs, deploy: true, fetchLatest }), /mất mạng/);
});

test("package.json: pnpm deploy dựng bằng --deploy trước khi gọi wrangler", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.deploy, /^node src\/build\/build\.mjs --deploy && wrangler deploy /);
});
```

- [ ] **Bước 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/release.test.mjs 2>&1 | grep -E "does not provide|SyntaxError|ℹ (pass|fail)" | head -4
```

Kỳ vọng: lỗi `does not provide an export named 'fetchStableLatest'`.

- [ ] **Bước 3: Thêm vào `website/src/release.mjs`**

Thêm hai dòng import ở đầu file, ngay dưới khối chú thích đầu (trước `export const RELEASES_URL`):

```js
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
```

và thêm hằng thư mục gốc repo ngay dưới `const ISO_INSTANT = …;`:

```js
const REPO_ROOT = new URL("../../", import.meta.url).pathname;
```

rồi thêm vào cuối file:

```js
/** stable/latest.json trên R2. Lỗi mạng, mã khác 200 hay JSON hỏng đều ném lỗi: không xác minh được thì không deploy. */
export async function fetchStableLatest(fetchImpl = fetch) {
  const url = `${RELEASES_URL}/stable/latest.json`;
  const refuse = "website không deploy khi chưa xác minh được bản đã phát hành";
  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new Error(`không đọc được ${url}: ${e.message}; ${refuse}`);
  }
  if (res.status !== 200) throw new Error(`${url} trả mã ${res.status}; ${refuse}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url} không phải JSON; ${refuse}`);
  }
}

/** Ngày commit gần nhất đổi dòng `"version"` của tauri.conf.json (`YYYY-MM-DD`); null khi không có git hay không phải repo. */
export function gitCommitDate({ cwd = REPO_ROOT } = {}) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "-G", '^  "version":', "--", "src-tauri/tauri.conf.json"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Version và ngày phát hành cho website. `deploy` mặc định là có cờ `--deploy` trên dòng lệnh. */
export async function resolveRelease({
  deploy = process.argv.includes("--deploy"),
  readConf = () => JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8")),
  gitDate = gitCommitDate,
  fetchLatest = () => fetchStableLatest(),
  today = () => vnDate(new Date().toISOString()),
} = {}) {
  const confVersion = readConf().version;
  if (deploy) return deployRelease({ confVersion, latest: await fetchLatest() });
  return previewRelease({ confVersion, gitDate: gitDate(), today: today() });
}
```

- [ ] **Bước 4: Sửa `website/package.json` (cho test cuối pass)**

Trong `website/package.json`, thay:

```json
    "deploy": "node src/build/build.mjs && wrangler deploy && wrangler deploy -c wrangler.www.jsonc && node tools/indexnow.mjs"
```

bằng:

```json
    "deploy": "node src/build/build.mjs --deploy && wrangler deploy && wrangler deploy -c wrangler.www.jsonc && node tools/indexnow.mjs"
```

- [ ] **Bước 5: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/release.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)|✖"
```

Kỳ vọng: `ℹ pass 14`, `ℹ fail 0`.

- [ ] **Bước 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add website/src/release.mjs website/test/release.test.mjs website/package.json && git commit -q -m "$(cat <<'EOF'
feat(website): đọc stable/latest.json của R2 và ngày commit nâng bản; pnpm deploy dựng bằng --deploy

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

## Task 3: Nối vào `site.mjs`, README, kiểm cả bộ và kiểm với R2 thật

**Files:**
- Modify: `website/src/site.mjs` (đầu file, hai trường `version`, `releaseDate`)
- Modify: `website/README.md`

- [ ] **Bước 1: Sửa `site.mjs`**

Thay hai dòng chú thích đầu và dòng `export const SITE = {`:

```js
// Nội dung từng trang nằm ở src/content/. Giá và hạn mức ở plans.mjs (có test đối chiếu với server/wrangler.jsonc).

export const SITE = {
```

bằng:

```js
// Nội dung từng trang nằm ở src/content/. Giá và hạn mức ở plans.mjs (có test đối chiếu với server/wrangler.jsonc).
import { resolveRelease } from "./release.mjs";

// Phiên bản và ngày phát hành không gõ tay: xem src/release.mjs (spec 2026-10-13-website-version-tu-dong-design.md).
const release = await resolveRelease();

export const SITE = {
```

và thay hai dòng:

```js
  version: "0.1.6",
  releaseDate: "2026-10-10",
```

bằng:

```js
  version: release.version,
  releaseDate: release.releaseDate,
```

- [ ] **Bước 2: Sửa `README.md`**

Trong `website/README.md`, ở dòng "Trạng thái (bản 0.1.6 đã phát hành chính thức, cài bằng…", thay đúng đoạn `bản 0.1.6 đã phát hành chính thức` bằng `bản mới nhất đã phát hành chính thức`.

Thêm mục mới ngay trước dòng `## Triển khai`:

```markdown
## Phiên bản và ngày phát hành
`SITE.version` và `SITE.releaseDate` (JSON-LD, `llms.txt`) **không gõ tay**: `src/release.mjs` tính chúng lúc nạp `site.mjs` (spec `2026-10-13-website-version-tu-dong-design.md`).
- **Xem trước** (`pnpm build`, `pnpm dev`, `pnpm test`; không cần mạng): version là `version` trong `src-tauri/tauri.conf.json`, ngày là ngày commit gần nhất đổi dòng đó. Nâng bản app là website tự theo.
- **Deploy** (`pnpm deploy` dựng với cờ `--deploy`): version và ngày lấy từ `https://releases.aitranslator.io.vn/stable/latest.json` (bản đã đăng thật, `pub_date` đổi sang ngày giờ Việt Nam). Không đọc được R2 hay dữ liệu lạ thì dừng, không có gì lên Cloudflare. R2 thấp hơn repo là bình thường (đã nâng bản, chưa đăng): website vẫn nói bản đã phát hành. R2 **cao hơn** repo thì dừng: `git pull` rồi deploy lại.
- Vì vậy sau mỗi lần phát hành **không còn commit `docs(website): phiên bản hiện tại X`**: chỉ cần `pnpm deploy`. `SITE.updated` (ngày cập nhật nội dung) vẫn do người sửa nội dung đặt.
```

- [ ] **Bước 3: Chạy cả bộ test website**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E "^ℹ (pass|fail|skipped)|✖" | head -8
```

Kỳ vọng: `ℹ fail 0` (test `version khớp bản phát hành` nay xanh vì `SITE.version` bằng `tauri.conf.json` theo cách tính), 2 test bỏ qua như baseline.

- [ ] **Bước 4: Kiểm với R2 thật (chế độ deploy, không deploy gì)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node src/build/build.mjs --deploy 2>&1 | tail -n 3; grep -n "Current version" dist/llms.txt | head -2; grep -o '"softwareVersion":"[^"]*"\|"datePublished":"2026-10-1[0-9]"' dist/index.html | sort -u | head -4
```

Kỳ vọng ở thời điểm viết kế hoạch (R2 đang 0.1.7): `Current version: 0.1.7 (released 2026-10-12)` và `"softwareVersion":"0.1.7"`. (Nếu R2 đã có bản mới hơn thì ra bản đó. Nếu lệnh dừng với "R2 đã có bản … mới hơn repo": `git pull` rồi chạy lại.) `website/dist` bị gitignore, không ảnh hưởng git.

- [ ] **Bước 5: Kiểm hàng rào mạng (ngắt mạng giả)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && HTTPS_PROXY=http://127.0.0.1:9 node src/build/build.mjs --deploy 2>&1 | tail -n 3; echo "mã thoát: $?"
```

Kỳ vọng: lỗi `không đọc được https://releases.aitranslator.io.vn/stable/latest.json … website không deploy khi chưa xác minh được bản đã phát hành` (lệnh in lỗi và dừng; `fetch` của Node không tự dùng `HTTPS_PROXY`, nên nếu bước này vẫn đọc được R2 thì bỏ qua bước, hàng rào đã được test bằng `fetchStableLatest` ở Task 2).

- [ ] **Bước 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add website/src/site.mjs website/README.md && git commit -q -m "$(cat <<'EOF'
feat(website): SITE.version và releaseDate tự tính, không gõ tay; README mô tả hai chế độ

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git log --oneline -1
```

---

## Task 4: Ghi trạng thái, đẩy các commit tính năng

- [ ] **Bước 1: Cập nhật dòng "Trạng thái" của kế hoạch này**

Thay `**Trạng thái:** chưa làm.` ở đầu file này bằng `**Trạng thái:** Task 0–3 xong ngày 2026-10-13; còn nâng 0.1.8, push và phát hành (Task 5–6).` (điền đúng tình trạng thật lúc làm).

- [ ] **Bước 2: Commit trạng thái và push `main`**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add docs/superpowers/plans/2026-10-13-website-version-tu-dong.md && git commit -q -m "$(cat <<'EOF'
docs(plans): kế hoạch phiên bản website tự theo bản đã đăng

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git fetch -q origin && git rev-list --left-right --count origin/main...main && git push origin main 2>&1 | tail -n 3
```

Kỳ vọng: `0  N` (không tụt sau `origin/main`), push thành công. Chủ dự án đã cho phép push (2026-10-13).

---

## Task 5: Nâng 0.1.7 → 0.1.8

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `Cargo.lock` (đúng bốn file như commit `943bd13`).

- [ ] **Bước 1: Sửa bốn file (mỗi chuỗi cũ phải khớp đúng một chỗ)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node - <<'EOF'
const fs = require("fs");
function edit(file, from, to) {
  const t = fs.readFileSync(file, "utf8");
  const n = t.split(from).length - 1;
  if (n !== 1) throw new Error(`${file}: mong 1 chỗ, thấy ${n}: ${from.slice(0, 60)}`);
  fs.writeFileSync(file, t.replace(from, () => to));
}
edit("package.json", '  "version": "0.1.7",', '  "version": "0.1.8",');
edit("src-tauri/tauri.conf.json", '  "version": "0.1.7",', '  "version": "0.1.8",');
edit("src-tauri/Cargo.toml", 'version = "0.1.7"', 'version = "0.1.8"');
edit("Cargo.lock", 'name = "meeting-translator"\nversion = "0.1.7"', 'name = "meeting-translator"\nversion = "0.1.8"');
console.log("xong");
EOF
git diff --stat
```

Kỳ vọng: 4 file, mỗi file 1 dòng đổi.

- [ ] **Bước 2: Kiểm khóa Cargo còn khớp, test, website**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo metadata --locked --format-version 1 > /dev/null && echo "Cargo.lock khớp"
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm test 2>&1 | grep -E "Test Files|Tests "
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test test/release.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"
```

Kỳ vọng: `Cargo.lock khớp`; vitest 23 file xanh; website `ℹ fail 0`.

- [ ] **Bước 3: Commit và push**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml Cargo.lock && git commit -q -m "$(cat <<'EOF'
chore(release): nâng phiên bản 0.1.7 → 0.1.8

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)" && git fetch -q origin && git rev-list --left-right --count origin/main...main && git push origin main 2>&1 | tail -n 3
```

---

## Task 6: Phát hành 0.1.8 (CẦN CHỦ DỰ ÁN XÁC NHẬN TRƯỚC KHI ĐẨY TAG)

Đẩy tag `v*` là **tự đăng bản lên R2 kênh stable**, và app của mọi người dùng sẽ tự nhận bản cập nhật. Không hoàn tác được (R2 có `latest.json` mới).

- [ ] **Bước 1: Cổng trước khi đẩy tag**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && gh run list -R dotienphong/ai-translator --branch main --limit 4 2>&1 | head -6; git status --short; git rev-parse HEAD origin/main
```

Điều kiện: lần CI của commit tính năng (không tính commit bản nâng nếu còn xếp hàng) kết thúc `success`; `HEAD` bằng `origin/main`; cây làm việc không có file đổi (trừ file nghiên cứu chưa theo dõi). CI đỏ hay còn chạy thì **dừng và báo**, không đẩy tag.

- [ ] **Bước 2: Hỏi chủ dự án xác nhận**

Nói rõ: sẽ đẩy tag `v0.1.8` tại commit nào, bản 0.1.8 gồm gì (giao diện 5 ngôn ngữ; chưa thử font CJK trên Windows; bản dịch ja/zh/ko chưa người bản ngữ duyệt), CI đã xanh hay chưa. Chỉ làm tiếp khi được trả lời đồng ý.

- [ ] **Bước 3: Đẩy tag**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git cat-file -t v0.1.6 && git tag v0.1.8 && git push origin v0.1.8 2>&1 | tail -n 3
```

(`git cat-file -t v0.1.6` cho biết tag cũ là `tag` (có chú thích) hay `commit` (nhẹ): tạo tag mới cùng kiểu; nếu là `tag`, dùng `git tag -a v0.1.8 -m "AI Translator 0.1.8"`.)

- [ ] **Bước 4: Theo dõi lần chạy Release (khoảng 50 phút)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && gh run list -R dotienphong/ai-translator --workflow Release --limit 2 2>&1 | head -4
```

Theo dõi bằng Monitor tới khi `completed`; thất bại thì đọc `gh run view <id> --log-failed`, báo chủ dự án, không tự thử lại.

- [ ] **Bước 5: Kiểm sau phát hành**

```bash
curl -s https://releases.aitranslator.io.vn/stable/latest.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.version,j.pub_date)})'
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node src/build/build.mjs --deploy 2>&1 | tail -n 2; grep -n "Current version" dist/llms.txt | head -1
```

Kỳ vọng: `0.1.8 <pub_date>` và `Current version: 0.1.8 (released <ngày>)`.

- [ ] **Bước 6: Báo chủ dự án và ghi nhớ**

Nói: bản 0.1.8 đã lên R2; `cd website && pnpm deploy` sẽ tự đưa website lên 0.1.8 và ngày phát hành thật; cảnh báo cũ "đừng deploy website trước khi có bản phát hành mới" **hết hiệu lực** (website nói 5 ngôn ngữ giao diện, bản 0.1.8 đã có). Cập nhật memory `ui-ja-zh-ko-2026-10-12.md` và `MEMORY.md` cho đúng.
