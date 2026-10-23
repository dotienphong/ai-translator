# Cập nhật model, kế hoạch 03: đăng, chạy lại khi lỗi, `--rollback-to`, tài liệu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm models:update` chạy đủ luồng. Có bản mới thì chuẩn bị, chạy cổng kiểm, in bảng, hỏi y/N. Gõ y thì: tải lên R2 (không ghi đè), dựng `body-(N+1)`, commit và đẩy `main`, ký trong CI, kiểm chữ ký, đăng `models.json`. `pnpm models:update --rollback-to <S>` quay các model về như manifest số S bằng một manifest số mới. Chạy lại sau khi bị ngắt thì làm tiếp từ bước dở.

**Architecture:** mọi thứ cần đăng được tính trước thành một "kế hoạch đăng" (`plan`: các mục thay, file cần tải lên, nội dung các file trong repo, lời commit). Hàm dựng kế hoạch là hàm thuần trong `update-lib.mjs`. Kế hoạch được lưu ở `target/models-update/state.json` ngay sau khi người vận hành gõ y. `update-publish.mjs` thực hiện kế hoạch theo từng bước, mỗi bước kiểm trạng thái thật trước khi làm (object trên R2, commit trên `origin/main`, lượt chạy CI, manifest công khai), nên chạy lại được an toàn.

**Tech Stack:** Node 24, rclone (remote `r2:`), `gh` (tài khoản `dotienphong`), wrangler (qua `pnpm --dir server exec`), cargo (bài kiểm `check_manifest_body`).

**Spec:** `docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md` mục 3.1, 5, 7, 8. Cần kế hoạch 01 và 02 xong trước.

**Quy ước:** `W=/Users/dtphong/Desktop/software_business/meeting-translator-work/cap-nhat-model`. Mọi lệnh bắt đầu bằng `cd $W &&`. Không push, không ghi R2, không chạy workflow ký trong kế hoạch này: phần đăng thật chỉ chạy khi có bản mới và chủ dự án gõ y.

---

## Cấu trúc file

| File | Việc |
|---|---|
| Sửa `scripts/models/update-lib.mjs` | `BUCKET`, `r2Key`, `manifestUrlOf`, `versionOf`, `serializeJson`, `publishedAtNow`, `isYes`, `bumpBody`, `rollbackChanges`, `bumpNotice`, `nextNoticeVersion`, `noticeIds`, `applyConfigText`, `applyUpstream`, `restoreUpstream`, `buildUpdatePlan`, `buildRollbackPlan`, `planTable` |
| Tạo `scripts/models/update-publish.mjs` | `ghEnv`, `publicMatches`, `uploadR2`, `writeFiles`, `checkManifestBody`, `commitAndPush`, `signInCi`, `verifySigned`, `publishManifest`, `publish` |
| Sửa `scripts/models/update.mjs` | chế độ đầy đủ, `--rollback-to`, `state.json`, kiểm điều kiện trước |
| Sửa `scripts/models/update.test.mjs` | test |
| Sửa `docs/release/phat-hanh.md` | mục 13 |
| Sửa `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | §6.7 |

Hình dạng của `plan` (dùng ở cả `update-lib.mjs`, `update-publish.mjs`, `update.mjs`):

```js
{
  kind: "update" | "rollback",
  base: 3,                          // số manifest đang chạy lúc dựng kế hoạch
  target: 4,                        // số manifest sẽ đăng
  publishedAt: "2026-10-24T03:00:00Z",
  replace: { "<id>": { ...mục file mới của manifest } },
  uploads: [{ key: "models/hy-mt2/9f3c2a1b4d5e/Hy-MT2-1.8B-Q8_0.gguf", path: "/tuyệt/đối", sha256: "<hex>" }],
  files: { "scripts/models/released/body-4.json": "<nội dung>", "...": "..." },   // đường dẫn tương đối trong repo
  bench: [{ from: "/tuyệt/đối/thư/mục/gate", to: "bench/model-updates/2026-10-24-hy-mt2-1.8b-q8_0-9f3c2a1" }],
  bodyRel: "scripts/models/released/body-4.json",
  prevRel: "scripts/models/released/body-3.json",
  message: "chore(models): hy-mt2-1.8b-q8_0 lên 9f3c2a1 (manifest số 4)",
  run: 123456789                    // lượt chạy sign-manifest.yml, ghi vào sau khi kích
}
```

---

### Task 1: Dựng phần thân mới, NOTICE, cấu hình

**Files:**
- Modify: `scripts/models/update-lib.mjs`
- Modify: `scripts/models/update.test.mjs`

- [ ] **Step 1: Viết test**

Thêm vào import từ `./update-lib.mjs`: `applyConfigText, applyUpstream, bumpBody, bumpNotice, isYes, manifestUrlOf, nextNoticeVersion, r2Key, restoreUpstream, rollbackChanges, versionOf` (`detect` đã có từ kế hoạch 01). Thêm cuối file:

```js
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
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: FAIL, `does not provide an export named 'applyConfigText'`.

- [ ] **Step 3: Viết code**

Thêm cuối `update-lib.mjs`:

```js
export const BUCKET = "ai-translator-releases";

/** Khóa R2 của bản mới: thư mục theo revision (12 ký tự đầu), để không bao giờ ghi đè file của bản cũ (spec mục 5.1). */
export const r2Key = (dir, revision, file) => `models/${dir}/${revision.slice(0, 12)}/${file}`;
/** `url` trong manifest: tương đối so với thư mục `models/` (`PUBLIC_BASE`). */
export const manifestUrlOf = (key) => key.replace(/^models\//, "");
/** Trường `version` của file: tiền tố của mục cộng revision ngắn. */
export const versionOf = (entry, revision) => `${entry.version_prefix}${shortRev(revision)}`;
/** JSON thụt lề hai dấu cách, như build-manifest.mjs. */
export const serializeJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
/** Giờ UTC dạng `published_at` của build-manifest.mjs. */
export const publishedAtNow = (date = new Date()) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
export const isYes = (answer) => /^[yY]$/.test(String(answer ?? "").trim());

/** Phần thân số mới: thay nguyên mục của các `id` trong `replace`, các phần khác giữ như `prev`. */
export function bumpBody(prev, replace, publishedAt) {
  const ids = new Set(prev.files.map((f) => f.id));
  for (const id of Object.keys(replace)) {
    if (!ids.has(id)) throw new Error(`manifest số ${prev.sequence} không có mục ${id}`);
  }
  return { ...prev, sequence: prev.sequence + 1, published_at: publishedAt, files: prev.files.map((f) => replace[f.id] ?? f) };
}

/** Phần nội dung của một mục file; quay lại chỉ lấy lại phần này (spec mục 7.1). */
const CONTENT = ["file", "version", "url", "bytes", "sha256"];

/**
 * Các mục cần đổi để quay về như `target`: mỗi `id` có ở cả hai bản mà phần nội dung khác thì lấy phần nội dung của
 * `target`, các trường khác giữ như `current`. `id` chỉ có ở `current` giữ nguyên; `id` chỉ có ở `target` thì ném.
 */
export function rollbackChanges(current, target) {
  const now = new Map(current.files.map((f) => [f.id, f]));
  const dropped = target.files.filter((f) => !now.has(f.id)).map((f) => f.id);
  if (dropped.length) {
    throw new Error(`manifest số ${target.sequence} có mục đã bỏ: ${dropped.join(", ")}; quay lại kiểu này làm tay.`);
  }
  const changes = {};
  for (const old of target.files) {
    const cur = now.get(old.id);
    if (CONTENT.some((k) => cur[k] !== old[k])) {
      changes[old.id] = { ...cur, ...Object.fromEntries(CONTENT.map((k) => [k, old[k]])) };
    }
  }
  return changes;
}

/** Thay revision của `repo` trong văn bản NOTICE ("https://huggingface.co/<repo> (revision <40 hex>)"). */
export function bumpNotice(text, repo, revision) {
  const escaped = repo.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const pattern = `(https://huggingface\\.co/${escaped} \\(revision )[0-9a-f]{40}\\)`;
  if (!new RegExp(pattern).test(text)) {
    throw new Error(`NOTICE không có dòng "https://huggingface.co/${repo} (revision …)": sửa NOTICE bằng tay trước.`);
  }
  return text.replace(new RegExp(pattern, "g"), `$1${revision})`);
}

export function nextNoticeVersion(version) {
  if (!/^[1-9]\d*$/.test(version)) throw new Error(`version của NOTICE phải là số nguyên dương, không phải ${version}`);
  return String(Number(version) + 1);
}

/** Các `id` của mục NOTICE mà upstream.json nhắc tới (`notice`). */
export const noticeIds = (upstream) => [...new Set(Object.values(upstream.entries).map((e) => e.notice).filter(Boolean))];

/**
 * Sửa `version`, `url` của mục `id` ngay trên văn bản của models.config.json: mỗi mục nằm trên một dòng, nên chỉ đổi đúng
 * dòng đó và giữ nguyên cách trình bày của cả file.
 */
export function applyConfigText(text, id, { version, url }) {
  const lines = text.split("\n");
  const i = lines.findIndex((line) => line.includes(`"id": "${id}"`));
  if (i < 0) throw new Error(`models.config.json không có dòng của ${id}`);
  let line = lines[i];
  for (const [key, value] of Object.entries({ version, url })) {
    const re = new RegExp(`"${key}": "[^"]*"`);
    if (!re.test(line)) throw new Error(`dòng của ${id} trong models.config.json thiếu ${key}`);
    line = line.replace(re, `"${key}": ${JSON.stringify(value)}`);
  }
  lines[i] = line;
  const out = lines.join("\n");
  JSON.parse(out);
  return out;
}

/** upstream.json sau khi đăng bản `next` của `id` ở manifest số `sequence`; `baseline`: mốc mới (hay `null`). */
export function applyUpstream(upstream, id, next, sequence, baseline) {
  const out = structuredClone(upstream);
  const e = out.entries[id];
  e.revision = next.revision;
  const record = { sequence, revision: next.revision };
  if (next.inputs) {
    e.inputs = next.inputs;
    record.inputs = next.inputs;
  } else {
    e.content = next.content;
    record.content = next.content;
  }
  if (e.gate.baseline !== undefined) {
    if (baseline) e.gate.baseline = baseline;
    record.baseline = e.gate.baseline;
  }
  e.history.push(record);
  return out;
}

/**
 * upstream.json khi quay `id` về bản đang dùng ở manifest số `target`, ghi thành dòng `history` số `sequence`. Bản đang bị
 * quay lại vào `rejected`, để lần kiểm sau không đề nghị đăng lại (spec mục 4.1, 7.1).
 */
export function restoreUpstream(upstream, id, target, sequence) {
  const out = structuredClone(upstream);
  const e = out.entries[id];
  const record = e.history.filter((h) => h.sequence <= target).at(-1);
  if (!record) throw new Error(`upstream.json không có bản nào của ${id} ở manifest số ${target} trở về trước`);
  e.rejected = [...(e.rejected ?? []), e.inputs ? { sequence, inputs: e.inputs } : { sequence, content: e.content }];
  e.revision = record.revision;
  if (record.inputs) e.inputs = record.inputs;
  else e.content = record.content;
  if (record.baseline !== undefined) e.gate.baseline = record.baseline;
  e.history.push({ ...record, sequence });
  return out;
}
```

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: mọi test pass.

- [ ] **Step 5: Commit**

```bash
cd $W && git add scripts/models/update-lib.mjs scripts/models/update.test.mjs && git commit -m "feat(models): dựng phần thân manifest mới, NOTICE, cấu hình, upstream.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Kế hoạch đăng và kế hoạch quay lại

**Files:**
- Modify: `scripts/models/update-lib.mjs`
- Modify: `scripts/models/update.test.mjs`

- [ ] **Step 1: Viết test**

Thêm vào import từ `./update-lib.mjs`: `buildRollbackPlan, buildUpdatePlan, planTable`. Thêm cuối file:

```js
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
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: FAIL, `does not provide an export named 'buildRollbackPlan'`.

- [ ] **Step 3: Viết code**

Trong `update-lib.mjs`, thêm import ở đầu file: `import { sha256hex } from "./lib.mjs";`. Thêm cuối file:

```js
/**
 * Kế hoạch đăng bản mới (spec mục 5). `body`: phần thân đang chạy. `prepared`: các mục đã chuẩn bị và qua cổng kiểm, mỗi
 * mục `{ id, entry, next, local: { path, bytes, sha256 }, bench, baseline }` (`bench`: `{ from, to }` chép kết quả đo vào
 * repo, `baseline`: mốc mới trong repo; cả hai `null` với mục không có cổng kiểm). `noticeTexts`: nội dung hiện tại của các
 * file NOTICE trong repo, theo `id` của mục NOTICE. `repo`: thư mục gốc của repo (đường dẫn tải lên của NOTICE).
 */
export function buildUpdatePlan({ body, upstream, configText, noticeTexts, prepared, publishedAt, repo }) {
  const changed = prepared.filter((p) => !p.unchanged);
  const names = (list) => list.map((p) => `${p.id} lên ${shortRev(p.next.revision)}`).join(", ");
  if (changed.length === 0) {
    // Mọi bản chuẩn bị đều trùng file đang phát hành: chỉ ghi nhận revision mới (spec mục 4.3), không ký, không đăng.
    let up = upstream;
    for (const p of prepared) up = applyUpstream(up, p.id, p.next, body.sequence, null);
    return {
      kind: "record",
      base: body.sequence,
      target: body.sequence,
      replace: {},
      uploads: [],
      files: { "scripts/models/upstream.json": serializeJson(up) },
      bench: [],
      message: `chore(models): ghi nhận revision mới của nguồn, nội dung không đổi (${names(prepared)})`,
    };
  }
  const target = body.sequence + 1;
  const old = new Map(body.files.map((f) => [f.id, f]));
  const replace = {};
  const uploads = [];
  const files = {};
  const notices = {};
  let up = upstream;
  let config = configText;
  for (const p of prepared.filter((item) => item.unchanged)) up = applyUpstream(up, p.id, p.next, target, null);
  for (const p of changed) {
    const was = old.get(p.id);
    const key = r2Key(p.entry.r2_dir, p.next.revision, was.file);
    replace[p.id] = {
      ...was,
      version: versionOf(p.entry, p.next.revision),
      url: manifestUrlOf(key),
      bytes: p.local.bytes,
      sha256: p.local.sha256,
    };
    uploads.push({ key, path: p.local.path, sha256: p.local.sha256 });
    up = applyUpstream(up, p.id, p.next, target, p.baseline);
    config = applyConfigText(config, p.id, replace[p.id]);
    const noticeId = p.entry.notice;
    if (noticeId && p.entry.source !== "github-release") {
      if (notices[noticeId] === undefined) {
        const was = old.get(noticeId);
        if (sha256hex(Buffer.from(noticeTexts[noticeId])) !== was.sha256) {
          throw new Error(`scripts/models/${was.file} trong repo khác bản đang phát hành: đối chiếu với R2 trước.`);
        }
      }
      notices[noticeId] = bumpNotice(notices[noticeId] ?? noticeTexts[noticeId], p.entry.repo, p.next.revision);
    }
  }
  for (const [id, text] of Object.entries(notices)) {
    const was = old.get(id);
    if (text === noticeTexts[id]) continue;
    const sha256 = sha256hex(Buffer.from(text));
    const version = nextNoticeVersion(was.version);
    const key = `models/notice/${version}-${sha256.slice(0, 8)}/${was.file}`;
    replace[id] = { ...was, version, url: manifestUrlOf(key), bytes: Buffer.byteLength(text), sha256 };
    const rel = `scripts/models/${was.file}`;
    files[rel] = text;
    uploads.push({ key, path: join(repo, rel), sha256 });
    config = applyConfigText(config, id, replace[id]);
  }
  const bodyRel = `scripts/models/released/body-${target}.json`;
  files[bodyRel] = serializeJson(bumpBody(body, replace, publishedAt));
  files["scripts/models/upstream.json"] = serializeJson(up);
  files["scripts/models/models.config.json"] = config;
  return {
    kind: "update",
    base: body.sequence,
    target,
    publishedAt,
    replace,
    uploads,
    files,
    bench: changed.map((p) => p.bench).filter(Boolean),
    bodyRel,
    prevRel: `scripts/models/released/body-${body.sequence}.json`,
    message: `chore(models): ${names(changed)} (manifest số ${target})`,
  };
}

/**
 * Kế hoạch quay các model về như phần thân `target` (spec mục 7.1), hay `null` khi không có gì để quay lại. `noticeTexts`:
 * nội dung các file NOTICE của `target` (tải từ R2), theo `id`, cho các mục NOTICE có đổi.
 */
export function buildRollbackPlan({ current, target, upstream, configText, noticeTexts, publishedAt }) {
  const replace = rollbackChanges(current, target);
  if (Object.keys(replace).length === 0) return null;
  const sequence = current.sequence + 1;
  const files = {};
  let up = upstream;
  let config = configText;
  for (const [id, entry] of Object.entries(replace)) {
    if (up.entries[id]) up = restoreUpstream(up, id, target.sequence, sequence);
    config = applyConfigText(config, id, entry);
    if (noticeTexts[id] !== undefined) files[`scripts/models/${entry.file}`] = noticeTexts[id];
  }
  const bodyRel = `scripts/models/released/body-${sequence}.json`;
  files[bodyRel] = serializeJson(bumpBody(current, replace, publishedAt));
  files["scripts/models/upstream.json"] = serializeJson(up);
  files["scripts/models/models.config.json"] = config;
  return {
    kind: "rollback",
    base: current.sequence,
    target: sequence,
    publishedAt,
    replace,
    uploads: [],
    files,
    bench: [],
    bodyRel,
    prevRel: `scripts/models/released/body-${current.sequence}.json`,
    message: `chore(models): quay lại model như manifest số ${target.sequence} (manifest số ${sequence})`,
  };
}

/** Bảng "đang chạy / sẽ đăng" của kế hoạch, in trước câu hỏi y/N. */
export function planTable(plan, body) {
  const old = new Map(body.files.map((f) => [f.id, f]));
  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const rows = Object.entries(plan.replace).map(([id, f]) => {
    const was = old.get(id);
    return `| ${id} | ${was.version}, ${was.sha256.slice(0, 12)}, ${mb(was.bytes)} | ${f.version}, ${f.sha256.slice(0, 12)}, ${mb(f.bytes)} | ${f.url} |`;
  });
  return [`Manifest số ${plan.base} → số ${plan.target}.`, "", "| id | Đang chạy | Sẽ đăng | url |", "|---|---|---|---|", ...rows].join("\n");
}
```

Ghi chú về test "buildRollbackPlan … null": `configText: "{}"` không bao giờ được đọc vì không có mục nào đổi.

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: mọi test pass. Nếu `planTable` ra số MB khác (bytes của Q8_0 là 1908528192 → 1820,1 MB), sửa giá trị kỳ vọng trong test theo phép tính đó.

- [ ] **Step 5: Commit**

```bash
cd $W && git add scripts/models/update-lib.mjs scripts/models/update.test.mjs && git commit -m "feat(models): kế hoạch đăng bản model mới và kế hoạch quay lại

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Các bước đăng

**Files:**
- Create: `scripts/models/update-publish.mjs`
- Modify: `scripts/models/update.test.mjs`

- [ ] **Step 1: Viết test**

Thêm import:

```js
import { commitAndPush, commitRecord, publicMatches, publishManifest, signInCi, uploadR2, verifySigned } from "./update-publish.mjs";
```

và thêm `serializeJson` vào import từ `./update-lib.mjs`.

Thêm cuối file:

```js
test("uploadR2: chưa có thì tải lên rồi kiểm lại; đã có cùng nội dung thì bỏ qua; khác nội dung thì dừng", async (t) => {
  const scratch = join(temp(t), "scratch");
  const u = { key: "models/hy-mt2/bbbbbbbbbbbb/f.gguf", path: "/w/f.gguf", sha256: sha256("noi dung") };
  let uploaded = false;
  const io = fakeIo({
    run(cmd, args) {
      if (cmd === "curl") return uploaded ? "200" : "404";
      if (cmd === "rclone") uploaded = true;
      return "";
    },
    download: () => "noi dung",
  });
  assert.equal(await uploadR2(io, u, scratch), "đã tải lên");
  assert.ok(io.calls.includes("rclone copyto /w/f.gguf r2:ai-translator-releases/models/hy-mt2/bbbbbbbbbbbb/f.gguf --s3-no-check-bucket"));
  const present = fakeIo({ run: (cmd) => (cmd === "curl" ? "200" : ""), download: () => "noi dung" });
  assert.equal(await uploadR2(present, u, scratch), "đã có");
  assert.ok(!present.calls.some((c) => c.startsWith("rclone")));
  const other = fakeIo({ run: (cmd) => (cmd === "curl" ? "200" : ""), download: () => "khac" });
  await assert.rejects(uploadR2(other, u, scratch), /nội dung khác/);
  const offline = fakeIo({ run: (cmd) => (cmd === "curl" ? "000" : "") });
  await assert.rejects(publicMatches(offline, "https://releases.aitranslator.io.vn/models/x", u.sha256, scratch), /dig @8\.8\.8\.8/);
});

/** Kế hoạch tối giản cho các bước git, CI. */
const smallPlan = () => ({
  target: 4,
  bodyRel: "scripts/models/released/body-4.json",
  prevRel: "scripts/models/released/body-3.json",
  files: { "scripts/models/released/body-4.json": "{}", "scripts/models/upstream.json": "{}" },
  bench: [{ from: "/w/gate", to: "bench/model-updates/x" }],
  message: "chore(models): thử (manifest số 4)",
});

test("commitRecord chỉ commit upstream.json rồi đẩy", () => {
  const io = fakeIo();
  commitRecord(io, { files: { "scripts/models/upstream.json": "{}" }, message: "chore(models): ghi nhận" });
  assert.deepEqual(io.calls, [
    "git add -- scripts/models/upstream.json",
    "git commit -m chore(models): ghi nhận",
    "git push origin HEAD:main",
  ]);
});

test("commitAndPush: đã có trên origin thì thôi; đã commit thì chỉ đẩy; chưa thì add, commit, đẩy", () => {
  const plan = smallPlan();
  const missing = new Error("không có");
  const onOrigin = fakeIo({ run: (cmd, args) => (args[0] === "log" ? "abc\n" : "") });
  assert.equal(commitAndPush(onOrigin, plan), "abc");
  assert.ok(!onOrigin.calls.some((c) => c.startsWith("git commit") || c.startsWith("git push")));
  const committed = fakeIo({
    run: (cmd, args) => (args[2]?.startsWith("origin/main:") ? missing : args[0] === "rev-parse" ? "def\n" : ""),
  });
  assert.equal(commitAndPush(committed, plan), "def");
  assert.ok(committed.calls.includes("git push origin HEAD:main"));
  assert.ok(!committed.calls.some((c) => c.startsWith("git commit")));
  const fresh = fakeIo({ run: (cmd, args) => (args[0] === "cat-file" ? missing : args[0] === "rev-parse" ? "ghi\n" : "") });
  assert.equal(commitAndPush(fresh, plan), "ghi");
  assert.ok(
    fresh.calls.includes(
      "git add -- scripts/models/released/body-4.json scripts/models/upstream.json bench/model-updates/x",
    ),
  );
  assert.ok(fresh.calls.includes("git commit -m chore(models): thử (manifest số 4)"));
  assert.ok(fresh.calls.includes("git push origin HEAD:main"));
});

/** `gh` giả: `runs` là kết quả của `gh run list`; `view` là `{ status, conclusion }` của lượt cũ. */
function ghIo(runs, view) {
  return fakeIo({
    run(cmd, args) {
      if (cmd !== "gh") return "";
      if (args[0] === "auth") return "token-thu\n";
      if (args[0] === "run" && args[1] === "list") return JSON.stringify(runs);
      if (args[0] === "run" && args[1] === "view") return JSON.stringify(view);
      if (args[0] === "run" && args[1] === "download") {
        const dir = args[args.indexOf("-D") + 1];
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "models.json"), "{}");
      }
      return "";
    },
  });
}

test("signInCi: kích workflow, tìm đúng lượt theo commit, đợi xong, tải bản đã ký", (t) => {
  const work = temp(t);
  const plan = smallPlan();
  const saved = [];
  const io = ghIo([{ databaseId: 7, headSha: "abc", createdAt: new Date().toISOString() }]);
  const path = signInCi(io, plan, "abc", { save: (p) => saved.push(p.run), work });
  assert.equal(path, join(work, "signed", "4", "models.json"));
  assert.equal(plan.run, 7);
  assert.deepEqual(saved, [7]);
  assert.ok(io.calls.some((c) => c.startsWith(`gh workflow run sign-manifest.yml --ref main -f body=${plan.bodyRel} -f previous=${plan.prevRel}`)));
  assert.ok(io.calls.some((c) => c.startsWith("gh run watch 7 --exit-status")));
});

test("signInCi chạy lại: lượt cũ hỏng thì kích lượt mới; lượt cũ còn chạy thì đợi tiếp", (t) => {
  const work = temp(t);
  const failed = { ...smallPlan(), run: 5 };
  const io = ghIo([{ databaseId: 9, headSha: "abc", createdAt: new Date().toISOString() }], { status: "completed", conclusion: "failure" });
  signInCi(io, failed, "abc", { save() {}, work });
  assert.equal(failed.run, 9);
  const running = { ...smallPlan(), run: 5 };
  const again = ghIo([], { status: "in_progress", conclusion: "" });
  signInCi(again, running, "abc", { save() {}, work });
  assert.equal(running.run, 5);
  assert.ok(!again.calls.some((c) => c.startsWith("gh workflow run")));
});

test("verifySigned: đúng khóa và trùng phần thân thì qua; khác phần thân hay khóa lạ thì dừng", async (t) => {
  const dir = temp(t);
  const key = await testKey("test-u3", "ai-translator update test key 3");
  const keys = [{ kid: key.kid, x: key.x }];
  const bodyText = serializeJson({ schema: 1, sequence: 4 });
  const path = join(dir, "models.json");
  writeFileSync(path, JSON.stringify(await signBody(key.privateKey, key.kid, JSON.stringify(JSON.parse(bodyText)))));
  await verifySigned(path, bodyText, keys);
  await assert.rejects(verifySigned(path, serializeJson({ schema: 1, sequence: 5 }), keys), /không khớp phần thân/);
  await assert.rejects(verifySigned(path, bodyText, []), /Không có khóa công khai/);
});

test("publishManifest: đã đăng thì thôi; chưa thì sao lưu, đăng bằng wrangler, kiểm lại", (t) => {
  const work = temp(t);
  const signedPath = join(work, "models.json");
  const signed = '{"body":"bmV3"}\n';
  writeFileSync(signedPath, signed);
  const old = JSON.stringify({ body: Buffer.from(JSON.stringify({ sequence: 3 })).toString("base64url") });
  const done = fakeIo({ text: () => signed });
  assert.match(publishManifest(done, signedPath, work), /đã được đăng từ trước/);
  assert.ok(!done.calls.some((c) => c.startsWith("pnpm")));
  let live = old;
  const io = fakeIo({
    text: () => live,
    run(cmd) {
      if (cmd === "pnpm") live = signed;
      return "";
    },
  });
  assert.match(publishManifest(io, signedPath, work), /đã đăng models\.json/);
  assert.equal(readFileSync(join(work, "backup", "models-seq-3.json"), "utf8"), old);
  assert.ok(
    io.calls.includes(
      `pnpm --dir server exec wrangler r2 object put ai-translator-releases/models/models.json --file ${signedPath} --content-type application/json --cache-control no-cache --remote`,
    ),
  );
  const stuck = fakeIo({ text: () => old });
  assert.throws(() => publishManifest(stuck, signedPath, work), /Đăng lại: pnpm --dir server exec wrangler/);
});
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: FAIL, `Cannot find module …/update-publish.mjs`.

- [ ] **Step 3: Viết `update-publish.mjs`**

```js
// Bước đăng của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md mục 5, 7):
// tải lên R2, ghi file trong repo, commit và đẩy main, ký trong CI, đăng models.json. Mỗi bước kiểm trạng thái thật trước
// khi làm, nên chạy lại sau khi bị ngắt thì làm tiếp từ bước dở mà không làm hai lần.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { builtInKeys, FORMAT, REPO, VERSION, verifyEnvelope } from "./lib.mjs";
import { BUCKET, MANIFEST_URL, PUBLIC_BASE, sameSignedBody } from "./update-lib.mjs";
import { sha256File } from "./update-io.mjs";

export const GH_USER = "dotienphong";
export const GH_REPO = "dotienphong/ai-translator";
const DNS_HINT = "lỗi mạng hay DNS: thử dig @8.8.8.8 releases.aitranslator.io.vn";

/** Biến môi trường cho `gh` chạy bằng tài khoản dotienphong (GITHUB_TOKEN của máy là tài khoản khác). */
export function ghEnv(io) {
  try {
    return { GH_TOKEN: io.run("gh", ["auth", "token", "--user", GH_USER]).trim() };
  } catch {
    throw new Error(`gh chưa đăng nhập tài khoản ${GH_USER}: chạy \`gh auth login\` với tài khoản đó.`);
  }
}

/** URL kèm tham số chống cache của Cloudflare (R2 bỏ qua tham số khi tìm object). */
const fresh = (url) => `${url}?t=${Date.now()}`;

/** File ở `url` có SHA-256 `sha256` không: `true`, `false` (khác nội dung) hay `null` (chưa có). Tải về `scratch` để băm. */
export async function publicMatches(io, url, sha256, scratch) {
  const code = io.run("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", fresh(url)]).trim();
  if (code === "404") return null;
  if (code !== "200") throw new Error(`${url} trả HTTP ${code} (${DNS_HINT}).`);
  rmSync(scratch, { force: true });
  io.download(fresh(url), scratch);
  const same = (await sha256File(scratch)) === sha256;
  rmSync(scratch, { force: true });
  return same;
}

/** Tải một file lên R2, không bao giờ ghi đè (spec mục 5.1), rồi kiểm lại qua tên miền công khai. */
export async function uploadR2(io, { key, path, sha256 }, scratch) {
  const url = PUBLIC_BASE + key.replace(/^models\//, "");
  const before = await publicMatches(io, url, sha256, scratch);
  if (before === true) return "đã có";
  if (before === false) throw new Error(`${key} đã có trên R2 với nội dung khác: không ghi đè, cần người xem.`);
  io.run("rclone", ["copyto", path, `r2:${BUCKET}/${key}`, "--s3-no-check-bucket"], { inherit: true });
  if ((await publicMatches(io, url, sha256, scratch)) !== true) {
    throw new Error(`Đã tải ${key} lên nhưng tải về qua ${url} không khớp SHA-256.`);
  }
  return "đã tải lên";
}

/**
 * Ghi các file của kế hoạch vào repo và chép kết quả đo (bỏ các lượt chạy thử). Chạy lại sau khi đã commit mà
 * target/models-update/ đã bị dọn thì bỏ qua bước chép (kết quả đo đã nằm trong commit).
 */
export function writeFiles(plan, repo = REPO) {
  for (const [rel, text] of Object.entries(plan.files)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), text);
  }
  for (const b of plan.bench) {
    if (!existsSync(b.from)) continue;
    cpSync(b.from, join(repo, b.to), { recursive: true, filter: (src) => !basename(src).startsWith("chay-thu") });
  }
}

/** Kiểm phần thân mới bằng đúng luật của app trước khi đẩy (như job `check` của sign-manifest.yml). */
export function checkManifestBody(io, plan, repo = REPO) {
  io.run("pnpm", ["build"], { inherit: true });
  io.run("cargo", ["test", "--locked", "-p", "meeting-translator", "--lib", "check_manifest_body", "--", "--ignored", "--nocapture"], {
    inherit: true,
    env: { MANIFEST_BODY: join(repo, plan.bodyRel), MANIFEST_PREVIOUS: join(repo, plan.prevRel) },
  });
}

/** Commit các file của kế hoạch và đẩy `main`; trả commit có phần thân mới. Đã đẩy hay đã commit từ lần trước thì không làm lại. */
export function commitAndPush(io, plan) {
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  if (io.succeeds("git", ["cat-file", "-e", `origin/main:${plan.bodyRel}`])) {
    return io.run("git", ["log", "-1", "--format=%H", "origin/main", "--", plan.bodyRel]).trim();
  }
  if (!io.succeeds("git", ["cat-file", "-e", `HEAD:${plan.bodyRel}`])) {
    io.run("git", ["add", "--", ...Object.keys(plan.files), ...plan.bench.map((b) => b.to)]);
    io.run("git", ["commit", "-m", plan.message]);
  }
  io.run("git", ["push", "origin", "HEAD:main"], { inherit: true });
  return io.run("git", ["rev-parse", "HEAD"]).trim();
}

/** Commit và đẩy kế hoạch chỉ ghi nhận revision (`kind: "record"`, spec mục 4.3): không ký, không đăng manifest. */
export function commitRecord(io, plan) {
  io.run("git", ["add", "--", ...Object.keys(plan.files)]);
  io.run("git", ["commit", "-m", plan.message]);
  io.run("git", ["push", "origin", "HEAD:main"], { inherit: true });
}

/**
 * Ký phần thân trong CI (sign-manifest.yml), trả đường dẫn models.json đã ký. Mã lượt chạy ghi vào `plan.run` rồi `save`
 * ngay, để lần chạy lại đợi đúng lượt đó; lượt đó đã hỏng hay bị hủy thì kích lượt mới.
 */
export function signInCi(io, plan, commit, { save, work }) {
  const env = ghEnv(io);
  const gh = (args, opts = {}) => io.run("gh", [...args, "--repo", GH_REPO], { env, ...opts });
  if (plan.run) {
    const { status, conclusion } = JSON.parse(gh(["run", "view", String(plan.run), "--json", "status,conclusion"]));
    if (status === "completed" && conclusion !== "success") plan.run = undefined;
  }
  if (!plan.run) {
    const started = Date.now();
    gh(["workflow", "run", "sign-manifest.yml", "--ref", "main", "-f", `body=${plan.bodyRel}`, "-f", `previous=${plan.prevRel}`]);
    for (let i = 0; i < 24 && !plan.run; i++) {
      io.sleep(5000);
      const runs = JSON.parse(
        gh(["run", "list", "--workflow", "sign-manifest.yml", "--event", "workflow_dispatch", "--limit", "10", "--json", "databaseId,headSha,createdAt"]),
      );
      plan.run = runs.find((r) => r.headSha === commit && Date.parse(r.createdAt) >= started - 60_000)?.databaseId;
    }
    if (!plan.run) throw new Error("Không tìm thấy lượt chạy sign-manifest.yml vừa kích: xem tab Actions rồi chạy lại lệnh.");
    save(plan);
  }
  console.log(`Đợi CI ký manifest (lượt ${plan.run})…`);
  gh(["run", "watch", String(plan.run), "--exit-status", "--interval", "15"], { inherit: true });
  const dir = join(work, "signed", String(plan.target));
  rmSync(dir, { recursive: true, force: true });
  gh(["run", "download", String(plan.run), "-n", "models-manifest", "-D", dir]);
  return join(dir, "models.json");
}

/** Bản đã ký: đúng định dạng, `kid` thuộc khối production, chữ ký hợp lệ, phần thân trùng dạng gọn của `bodyText`. */
export async function verifySigned(path, bodyText, keys = builtInKeys()) {
  const envelope = JSON.parse(readFileSync(path, "utf8"));
  if (envelope.format !== FORMAT || envelope.version !== VERSION) throw new Error("Bản đã ký sai định dạng phong bì.");
  await verifyEnvelope(envelope, keys);
  if (!sameSignedBody(envelope, bodyText)) throw new Error("Bản đã ký không khớp phần thân trong repo: KHÔNG đăng, cần người xem.");
}

/** Đăng models.json đã ký (sao lưu bản đang chạy trước), rồi kiểm lại qua URL công khai. */
export function publishManifest(io, signedPath, work) {
  const signed = readFileSync(signedPath, "utf8");
  const live = io.text(fresh(MANIFEST_URL));
  if (live === signed) return "models.json này đã được đăng từ trước";
  const sequence = JSON.parse(Buffer.from(JSON.parse(live).body, "base64url").toString("utf8")).sequence;
  const backup = join(work, "backup", `models-seq-${sequence}.json`);
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, live);
  const put = ["--dir", "server", "exec", "wrangler", "r2", "object", "put", `${BUCKET}/models/models.json`, "--file", signedPath, "--content-type", "application/json", "--cache-control", "no-cache", "--remote"];
  io.run("pnpm", put, { inherit: true });
  if (io.text(fresh(MANIFEST_URL)) !== signed) {
    throw new Error(`Đã đăng nhưng ${MANIFEST_URL} chưa trả đúng bản đã ký (${DNS_HINT}). Đăng lại: pnpm ${put.join(" ")}`);
  }
  return `đã đăng models.json (bản cũ lưu ở ${backup})`;
}

/** Thực hiện kế hoạch đăng từ đầu hay từ bước dở. `save(plan)` ghi lại state.json khi kế hoạch có thêm thông tin. */
export async function publish(io, plan, { save, work, repo = REPO }) {
  writeFiles(plan, repo);
  for (const u of plan.uploads) console.log(`${u.key}: ${await uploadR2(io, u, join(work, "scratch"))}`);
  checkManifestBody(io, plan, repo);
  const commit = commitAndPush(io, plan);
  const signed = signInCi(io, plan, commit, { save, work });
  await verifySigned(signed, plan.files[plan.bodyRel]);
  console.log(publishManifest(io, signed, work));
}
```

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: mọi test pass.

- [ ] **Step 5: Commit**

```bash
cd $W && git add scripts/models/update-publish.mjs scripts/models/update.test.mjs && git commit -m "feat(models): các bước đăng model: R2, commit, ký trong CI, models.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lệnh đầy đủ, `--rollback-to`, chạy lại

**Files:**
- Modify: `scripts/models/update.mjs` (viết lại toàn bộ)

- [ ] **Step 1: Viết lại `update.mjs`**

```js
#!/usr/bin/env node
// `pnpm models:update`: kiểm bản mới của các model ở nguồn, chuẩn bị, chạy cổng kiểm, hỏi rồi đăng lên hệ thống; quay lại
// bản trước bằng `--rollback-to` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md; runbook
// docs/release/phat-hanh.md mục 13).
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { builtInKeys, REPO } from "./lib.mjs";
import {
  buildRollbackPlan,
  buildUpdatePlan,
  checkTable,
  checkUpstream,
  gateTable,
  isYes,
  latestBody,
  noticeIds,
  parseArgs,
  planTable,
  publishedAtNow,
  PUBLIC_BASE,
  rollbackChanges,
  sameSignedBody,
  serializeJson,
  shortRev,
  MANIFEST_URL,
} from "./update-lib.mjs";
import { ask, checkLiveManifest, checkSources, createIo, fetchPublished } from "./update-io.mjs";
import { buildTools, runGate } from "./update-gate.mjs";
import { prepare } from "./update-prepare.mjs";
import { GH_REPO, commitRecord, ghEnv, publicMatches, publish, writeFiles } from "./update-publish.mjs";

const PATHS = {
  upstream: resolve(REPO, "scripts/models/upstream.json"),
  config: resolve(REPO, "scripts/models/models.config.json"),
  released: resolve(REPO, "scripts/models/released"),
  work: resolve(REPO, "target/models-update"),
};
const STATE = join(PATHS.work, "state.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const loadState = () => (existsSync(STATE) ? readJson(STATE) : null);
function saveState(plan) {
  mkdirSync(PATHS.work, { recursive: true });
  writeFileSync(STATE, serializeJson(plan));
}
const clearState = () => rmSync(STATE, { force: true });

/** Kiểm manifest đang chạy và upstream.json, rồi so với nguồn; in bảng. */
async function check(io) {
  const latest = await checkLiveManifest(io, PATHS.released, builtInKeys());
  const upstream = readJson(PATHS.upstream);
  const problems = checkUpstream(upstream, readJson(PATHS.config), readJson(latest.path));
  if (problems.length) throw new Error(`upstream.json không khớp:\n- ${problems.join("\n- ")}`);
  console.log(`Manifest đang chạy là số ${latest.sequence}, khớp ${relative(REPO, latest.path)}.\n`);
  const results = await checkSources(io, upstream, PATHS.work);
  console.log(checkTable(results, upstream));
  return { latest, upstream, results };
}

/** Điều kiện trước khi đăng hay quay lại (spec mục 3.1 bước 1). */
function preflight(io) {
  const branch = io.run("git", ["branch", "--show-current"]).trim();
  if (branch !== "main") throw new Error(`Phải chạy ở nhánh main (đang ở ${branch || "HEAD rời"}).`);
  if (io.run("git", ["status", "--porcelain"]).trim()) throw new Error("Cây làm việc chưa sạch: commit hay cất các thay đổi trước.");
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  if (io.run("git", ["rev-parse", "HEAD"]).trim() !== io.run("git", ["rev-parse", "origin/main"]).trim()) {
    throw new Error("main ở máy khác origin/main: pull hay push trước.");
  }
  if (!io.run("rclone", ["listremotes"]).split("\n").includes("r2:")) {
    throw new Error("rclone chưa có remote r2: (runbook docs/release/phat-hanh.md mục 13).");
  }
  ghEnv(io);
  io.run("pnpm", ["--dir", "server", "exec", "wrangler", "--version"]);
  io.run("uv", ["--version"]);
  io.run("cargo", ["--version"]);
}

/** Đẩy main hủy lượt CI đang chạy trên main (cancel-in-progress): báo trước câu hỏi y/N. */
function warnCi(io) {
  try {
    const runs = JSON.parse(
      io.run("gh", ["run", "list", "--repo", GH_REPO, "--workflow", "ci.yml", "--branch", "main", "--status", "in_progress", "--json", "databaseId"], {
        env: ghEnv(io),
      }),
    );
    if (runs.length) console.log(`\nCHÚ Ý: CI đang chạy trên main (lượt ${runs.map((r) => r.databaseId).join(", ")}); đẩy main sẽ hủy lượt đó.`);
  } catch (e) {
    console.log(`\n(Không kiểm được CI đang chạy: ${e.message})`);
  }
}

/** Hỏi rồi thực hiện kế hoạch; ghi state.json trước bước đầu tiên để chạy lại được. */
async function confirmAndPublish(io, plan, question) {
  warnCi(io);
  console.log(
    "\nGõ y: tải file lên R2 (nếu có), commit và đẩy main, ký manifest trong CI, đăng models.json. App của người dùng nhận trong vòng một ngày.",
  );
  if (!isYes(await ask(question))) {
    console.log("Không đăng.");
    return 0;
  }
  saveState(plan);
  await publish(io, plan, { save: saveState, work: PATHS.work });
  clearState();
  console.log(`\nXong: manifest số ${plan.target} đã đăng.`);
  return 0;
}

/** Làm tiếp lượt đăng dở trong state.json. */
async function resume(io, plan) {
  const envelope = JSON.parse(io.text(`${MANIFEST_URL}?t=${Date.now()}`));
  const live = JSON.parse(Buffer.from(envelope.body, "base64url").toString("utf8")).sequence;
  if (live === plan.target && sameSignedBody(envelope, plan.files[plan.bodyRel])) {
    clearState();
    console.log(`Lượt đăng manifest số ${plan.target} đã xong từ trước.`);
    return 0;
  }
  if (live !== plan.base) {
    throw new Error(`${STATE} là lượt đăng số ${plan.target} trên số ${plan.base}, nhưng manifest đang chạy là số ${live}: xem lại, rồi xóa file đó nếu bỏ lượt này.`);
  }
  console.log(`Có lượt đăng dở: ${plan.message}.`);
  if (!isYes(await ask("Làm tiếp lượt đăng dở? [y/N] "))) {
    console.log(`Không làm tiếp. Muốn bỏ hẳn lượt này thì xóa ${STATE} và hoàn tác các file đã ghi trong repo.`);
    return 0;
  }
  await publish(io, plan, { save: saveState, work: PATHS.work });
  clearState();
  console.log(`\nXong: manifest số ${plan.target} đã đăng.`);
  return 0;
}

async function update(io) {
  const pending = loadState();
  if (pending) return resume(io, pending);
  preflight(io);
  const { latest, upstream, results } = await check(io);
  if (results.some((r) => r.status === "stop")) {
    console.log("\nCó mục phải dừng (xem bảng). Không đăng gì.");
    return 1;
  }
  const fresh = results.filter((r) => r.status === "new");
  if (fresh.length === 0) {
    console.log("\nKhông có bản mới để đăng.");
    return 0;
  }
  const body = readJson(latest.path);
  const date = new Date().toISOString().slice(0, 10);
  const prepared = [];
  let built = false;
  for (const r of fresh) {
    const entry = upstream.entries[r.id];
    const was = body.files.find((f) => f.id === r.id);
    console.log(`\n== ${r.id}: chuẩn bị bản ${shortRev(r.next.revision)}`);
    const local = await prepare(io, PATHS.work, r.id, entry, r.next, was.file);
    const item = { id: r.id, entry, next: r.next, local, gate: null, bench: null, baseline: null, unchanged: false };
    if (local.sha256 === was.sha256) {
      console.log("Bản chuẩn bị trùng file đang phát hành: không chạy cổng kiểm, không đăng file này.");
      item.unchanged = true;
    } else if (entry.gate.kind === "mt" || entry.gate.kind === "asr") {
      if (!built) {
        buildTools(io);
        built = true;
      }
      const label = `update-${r.id}-${shortRev(r.next.revision)}`;
      const outDir = join(PATHS.work, r.id, r.next.revision, "gate");
      item.gate = runGate(io, entry, local.path, label, outDir);
      // Môi trường chuyển (bản các gói Python) đi cùng kết quả đo vào repo, để biết bản phát hành được chuyển thế nào.
      const convertEnv = join(PATHS.work, r.id, r.next.revision, "convert-env.txt");
      if (existsSync(convertEnv)) copyFileSync(convertEnv, join(outDir, "convert-env.txt"));
      item.bench = { from: outDir, to: `bench/model-updates/${date}-${r.id}-${shortRev(r.next.revision)}` };
      item.baseline = `${item.bench.to}/${basename(item.gate.result)}`;
      console.log(gateTable(item.gate, entry.gate.kind));
    } else {
      console.log("Khác biệt so với bản đang phát hành:");
      io.run("diff", ["-u", await fetchPublished(io, PATHS.work, was), local.path], { inherit: true, ok: [0, 1] });
    }
    prepared.push(item);
  }
  const failed = prepared.filter((p) => p.gate && !p.gate.pass).map((p) => p.id);
  if (failed.length) {
    console.log(`\nKhông đạt cổng kiểm: ${failed.join(", ")}. Không đăng gì.`);
    return 1;
  }
  const noticeTexts = Object.fromEntries(
    noticeIds(upstream).map((id) => [id, readFileSync(resolve(REPO, "scripts/models", body.files.find((f) => f.id === id).file), "utf8")]),
  );
  const plan = buildUpdatePlan({
    body,
    upstream,
    configText: readFileSync(PATHS.config, "utf8"),
    noticeTexts,
    prepared,
    publishedAt: publishedAtNow(),
    repo: REPO,
  });
  if (plan.kind === "record") {
    console.log(`\n${plan.message}`);
    if (!isYes(await ask("Ghi nhận revision mới vào upstream.json (không đăng gì cho người dùng)? [y/N] "))) {
      console.log("Không ghi nhận.");
      return 0;
    }
    writeFiles(plan);
    commitRecord(io, plan);
    console.log("Đã ghi nhận và đẩy main.");
    return 0;
  }
  console.log(`\n${planTable(plan, body)}`);
  return confirmAndPublish(io, plan, "Đăng bản model mới cho người dùng? [y/N] ");
}

async function rollback(io, sequence) {
  if (loadState()) throw new Error(`Còn lượt đăng dở (${STATE}): chạy pnpm models:update để làm tiếp, hay xóa file đó.`);
  preflight(io);
  const latest = await checkLiveManifest(io, PATHS.released, builtInKeys());
  if (sequence >= latest.sequence) throw new Error(`--rollback-to ${sequence}: manifest đang chạy là số ${latest.sequence}, phải chọn số nhỏ hơn.`);
  const targetPath = join(PATHS.released, `body-${sequence}.json`);
  if (!existsSync(targetPath)) throw new Error(`Không có ${relative(REPO, targetPath)}.`);
  const current = readJson(latest.path);
  const target = readJson(targetPath);
  const upstream = readJson(PATHS.upstream);
  const notices = new Set(noticeIds(upstream));
  const noticeTexts = {};
  for (const [id, f] of Object.entries(rollbackChanges(current, target))) {
    const same = await publicMatches(io, PUBLIC_BASE + f.url, f.sha256, join(PATHS.work, "scratch"));
    if (same !== true) throw new Error(`${f.url} ${same === null ? "không còn" : "khác SHA-256"} trên R2: không quay lại được.`);
    if (notices.has(id)) noticeTexts[id] = io.text(PUBLIC_BASE + f.url);
  }
  const plan = buildRollbackPlan({
    current,
    target,
    upstream,
    configText: readFileSync(PATHS.config, "utf8"),
    noticeTexts,
    publishedAt: publishedAtNow(),
  });
  if (!plan) {
    console.log(`Các model đang chạy đã giống manifest số ${sequence}: không có gì để quay lại.`);
    return 0;
  }
  console.log(`\n${planTable(plan, current)}`);
  return confirmAndPublish(io, plan, `Quay các model về như manifest số ${sequence}? [y/N] `);
}

// gateOnly: GIỮ NGUYÊN hàm `gateOnly` đang có trong file (đã sửa sau lượt rà của kế hoạch 02: kiểm mục có trong manifest,
// `checkGateInputs` trước khi tải, `gateTable(gate, kind)`). Chép nguyên văn từ file hiện tại vào đây khi viết lại file.

async function main(argv) {
  const args = parseArgs(argv);
  const io = createIo();
  if (args.mode === "check") {
    if (loadState()) console.log(`Có lượt đăng dở (${STATE}): chạy pnpm models:update để làm tiếp.\n`);
    const { results } = await check(io);
    return results.some((r) => r.status === "stop") ? 1 : 0;
  }
  if (args.mode === "gate-only") return gateOnly(io, args.id);
  if (args.mode === "rollback") return rollback(io, args.sequence);
  return update(io);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Lỗi: ${e.message}`);
    process.exit(2);
  },
);
```

Ghi chú:
- Trong `rollback`, mọi mục sẽ đổi (theo `rollbackChanges`, chỉ phần nội dung) đều được tải về qua tên miền công khai để
  kiểm SHA-256; mục chỉ khác `tier` không nằm trong danh sách nên không bị tải.
- `gateOnly`: giữ nguyên bản đang có trong file (sau các lượt sửa của kế hoạch 02), cùng mọi import nó cần (ví dụ
  `checkGateInputs` từ `update-gate.mjs`). Danh sách import ở trên là tối thiểu cho phần mới; gộp với import hiện có.

- [ ] **Step 2: Kiểm cú pháp và test**

Run: `cd $W && node --check scripts/models/update.mjs && node --test scripts/models/update.test.mjs scripts/models/manifest.test.mjs`
Expected: không lỗi cú pháp; mọi test pass.

- [ ] **Step 3: Chạy thử các nhánh không ghi gì**

```bash
cd $W && pnpm models:update --check; echo "mã $?"
cd $W && pnpm models:update --rollback-to 9; echo "mã $?"
```

Expected:
- `--check`: như kế hoạch 01, `mã 0`.
- `--rollback-to 9`: dừng ở `preflight` với "Phải chạy ở nhánh main (đang ở cap-nhat-model)", `mã 2`. Đây là đúng: lệnh đăng và quay lại chỉ chạy ở thư mục chính trên `main`.

- [ ] **Step 4: Commit**

```bash
cd $W && git add scripts/models/update.mjs && git commit -m "feat(models): pnpm models:update đầy đủ, --rollback-to, chạy lại lượt dở

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Runbook và spec chính

**Files:**
- Modify: `docs/release/phat-hanh.md` (thêm mục 13 ở cuối)
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (§6.7)

- [ ] **Step 1: Thêm mục 13 vào runbook**

Thêm cuối `docs/release/phat-hanh.md`:

````markdown
## 13. Cập nhật model bằng `pnpm models:update`

Spec: `docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md`.

### 13.1. Điều kiện máy

- Chạy ở thư mục chính, nhánh `main`, cây sạch, khớp `origin/main`. Không có phiên nào khác đang sửa `main`.
- rclone có remote `r2:` (token R2 chỉ quyền object, vì vậy lệnh dùng `--s3-no-check-bucket`).
- `gh auth login` với tài khoản `dotienphong` (lệnh tự lấy token bằng `gh auth token --user dotienphong`).
- wrangler đăng nhập được (`pnpm --dir server exec wrangler whoami`).
- `uv`, `cargo`, dữ liệu thử `bench/phase0/data/` và `tools/llama-b11146/` có sẵn.
- Ổ còn trống trên 10 GB (bản mới tải vào `target/models-update/`).

### 13.2. Cách chạy

| Lệnh | Việc |
|---|---|
| `pnpm models:update --check` | Chỉ kiểm nguồn, in bảng. Chạy ở đâu cũng được. |
| `pnpm models:update` | Có bản mới thì chuẩn bị, chạy cổng kiểm (máy bận 30–60 phút mỗi model), in bảng, hỏi y/N. Gõ y thì đăng. |
| `pnpm models:update --gate-only <id>` | Cổng kiểm với file đang phát hành (phải đạt); dùng khi nghi cổng kiểm lệch. |
| `pnpm models:update --rollback-to <S>` | Quay các model về như manifest số S (mục 13.4). |

Sau khi đăng: app nhận manifest mới trong vòng một ngày (luồng nền kiểm mỗi giờ, tối đa một lần mỗi ngày), hiện thông báo "Có bản mới của gói…" và, từ 0.2.6, dấu chấm trên khay.

### 13.3. Lệnh dừng giữa chừng

Lượt đã gõ y được ghi ở `target/models-update/state.json`. Chạy lại `pnpm models:update` thì lệnh hỏi "Làm tiếp lượt đăng dở?" và làm tiếp từ bước dở: file đã có trên R2 (cùng SHA-256) không tải lại, commit đã đẩy không commit lại, lượt CI đã hỏng thì kích lượt mới. Muốn bỏ hẳn lượt dở: xóa `state.json` và hoàn tác các file lệnh đã ghi trong repo (`git checkout -- scripts/models bench/model-updates`); file đã tải lên R2 mà chưa manifest nào trỏ tới thì vô hại.

Lỗi "Bản đã ký không khớp phần thân": dừng hẳn, không đăng tay; xem lượt chạy CI và phần thân trong repo.

Lỗi sau khi đã đăng ("chưa trả đúng bản đã ký"): kiểm `dig @8.8.8.8 releases.aitranslator.io.vn` (sự cố DNSSEC io.vn 2026-10-22), rồi chạy lại lệnh đăng mà thông báo in ra. Không đăng lại bản sao lưu trong `target/models-update/backup/`: app từ chối manifest có số nhỏ hơn bản đã nhận; muốn quay lại thì dùng `--rollback-to`.

### 13.4. Quay lại bản trước

`pnpm models:update --rollback-to <S>` đăng manifest số mới có phần nội dung (`file`, `version`, `url`, `bytes`, `sha256`) của các mục lấy từ `body-S.json`; `tier` và các trường khác giữ như bản đang chạy. Lệnh kiểm từng file cũ còn trên R2 và khớp SHA-256 trước khi hỏi y/N; không chạy cổng kiểm. Người đã tải bản mới sẽ thấy thông báo "có bản mới" để tải lại bản cũ.

Bản vừa gỡ được ghi vào `rejected` của mục đó trong `scripts/models/upstream.json`; các lần kiểm sau báo "bỏ qua" cho bản đó thay vì đề nghị đăng lại. Khi nguồn sửa xong và ra bản khác, lệnh đề nghị bản mới như thường. Muốn đăng lại đúng bản đã gỡ: xóa dòng đó khỏi `rejected`, commit, rồi chạy lại `pnpm models:update`.

### 13.4b. Nguồn đổi mà nội dung không đổi

Khi nguồn ra revision mới mà file chuẩn bị xong trùng SHA-256 với file đang phát hành (thường ở gói Nhanh khi repo nguồn chỉ đổi tệp phụ), lệnh không chạy cổng kiểm, không đăng file đó. Nếu mọi mục đều như vậy, lệnh hỏi "Ghi nhận revision mới vào upstream.json?"; gõ y thì chỉ commit `upstream.json` và đẩy `main` (không ký, không đăng manifest, người dùng không thấy gì).

### 13.5. VAD và các file giấy phép không theo dõi

Bản silero-vad mới chỉ được báo ("có bản mới (chỉ báo)"): đổi VAD làm tay (kiểm giao diện ONNX với `crates/pipeline`, đo lại, dựng phần thân bằng `build-manifest.mjs`, ký và đăng như mục 2). Các file `whisper-license`, `whisper-cpp-license`, `silero-vad-license` cũng đổi bằng tay.
````

- [ ] **Step 2: Sửa spec chính §6.7**

Trong gạch đầu dòng "**Cập nhật model:**", thêm câu sau câu "Có bản mới thì hỏi người dùng, không tự tải.": "Phía phát hành, `pnpm models:update` kiểm bản mới của các model ở nguồn (Hugging Face, GitHub), chạy cổng kiểm A3/A4 bằng engine của app, hỏi người vận hành rồi đăng file lên R2 và ký manifest trong CI; `--rollback-to` quay về bản trước bằng một manifest số mới (spec 2026-10-23-cap-nhat-model-tu-dong, runbook mục 13)."

- [ ] **Step 3: Commit**

```bash
cd $W && git add docs/release/phat-hanh.md docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && git commit -m "docs: runbook mục 13 cập nhật model, spec §6.7

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Kiểm toàn bộ

- [ ] **Step 1: Test và định dạng**

```bash
cd $W && node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs
cd $W && cargo fmt --all -- --check && cargo test --workspace --locked
cd $W && pnpm install --frozen-lockfile && pnpm test && pnpm build
```

Expected: tất cả xanh.

- [ ] **Step 2: Rà code một lượt**

Dùng superpowers:requesting-code-review cho các file `scripts/models/update*.mjs`, tập trung vào: không bao giờ ghi đè object R2; không đăng khi chữ ký sai hay phần thân lệch; chạy lại không tăng `sequence` hai lần; không in token. Sửa các phát hiện đúng, commit riêng.

- [ ] **Step 3: Báo chủ dự án**

Báo: các lệnh đã có, kết quả `--check` và hiệu chỉnh `--gate-only` (kế hoạch 02), phần đăng thật chưa chạy lần nào vì chưa có bản mới ở nguồn. Lần đăng thật đầu tiên là lần thử đầu cuối: đề nghị chủ dự án chạy lúc rảnh, cùng tôi theo dõi. Sau khi gộp vào `main` (khi được cho phép), chạy thử an toàn ở thư mục chính: `pnpm models:update --rollback-to 2` phải qua `preflight` và báo "không có gì để quay lại" (số 2 và số 3 chỉ khác `tier`), không ghi gì.
