# Cập nhật model, kế hoạch 02: chuẩn bị bản mới và cổng kiểm (`--gate-only`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tải hay tự chuyển bản model mới vào thư mục làm việc, rồi chạy cổng kiểm A3 (dịch) hay A4 (nhận dạng) bằng đúng engine của app, so với mốc của model đang phát hành. `pnpm models:update --gate-only <id>` chạy cổng kiểm với file đang phát hành để hiệu chỉnh.

**Architecture:** luật cổng kiểm thuần ở `update-lib.mjs` (`gateMt`, `gateAsr`). `update-prepare.mjs` tải hay chuyển file (`prepare`). `update-gate.mjs` chạy `latency-bench mt-eval` hay `asr-eval`, chấm bằng `score_mt.py` hay `score_asr.py`, rồi áp luật. Đường dẫn của cổng kiểm gom trong `GATE_PATHS` để test thay bằng thư mục tạm.

**Tech Stack:** Node 24, `latency-bench` (Rust, workspace), `llama-server` b11146 trong `tools/`, `asr-worker` (features `metal,shared-encode`), `uv` cho Python 3.12 (COMET, jiwer).

**Spec:** `docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md` mục 4.3, 4.4. Cần kế hoạch 01 xong trước.

**Quy ước:** `W=/Users/dtphong/Desktop/software_business/meeting-translator-work/cap-nhat-model`, `R=/Users/dtphong/Desktop/software_business/ai-translator` (thư mục chính, có dữ liệu thử và `tools/`). Mọi lệnh bắt đầu bằng `cd $W &&`. Không push.

---

## Cấu trúc file

| File | Việc |
|---|---|
| Sửa `scripts/models/update-lib.mjs` | `REGRESSION`, `FLOORS`, `ASR_RELATIVE`, `floorFor`, `mtRunName`, `gateMt`, `gateAsr`, `gateTable` |
| Sửa `scripts/models/update-io.mjs` | `fetchPublished` |
| Tạo `scripts/models/update-prepare.mjs` | `verifyContent`, `prepare` (tải `hf-file`, `github-release`; chuyển `hf-convert`) |
| Tạo `scripts/models/update-gate.mjs` | `GATE_PATHS`, `buildTools`, `runGate` |
| Sửa `scripts/models/update.mjs` | chế độ `--gate-only` |
| Sửa `scripts/models/update.test.mjs` | test |

---

### Task 1: Luật cổng kiểm

**Files:**
- Modify: `scripts/models/update-lib.mjs`
- Modify: `scripts/models/update.test.mjs`

- [ ] **Step 1: Viết test**

Trong `update.test.mjs`, thêm `ASR_RELATIVE, floorFor, gateAsr, gateMt, gateTable, mtRunName` vào import từ `./update-lib.mjs`. Thêm cuối file:

```js
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
  assert.match(gateTable(mt), /\| en->vi \| 0\.842 \| 0\.850 \| \+0\.008 \| đạt \|/);
  assert.match(gateTable(mt), /Cổng kiểm: ĐẠT\./);
  const asr = gateAsr({ "en-wb": { wer: 0.07 } }, { "en-wb": { wer: 0.054 } });
  assert.match(gateTable(asr), /\| en-wb \(WER\) \| 0\.054 \| 0\.070 \| XẤU HƠN \|/);
  assert.match(gateTable(asr), /Cổng kiểm: KHÔNG ĐẠT\./);
});
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: FAIL, `does not provide an export named 'ASR_RELATIVE'`.

- [ ] **Step 3: Viết code**

Trong `update-lib.mjs`, đổi dòng import `node:path` thành `import { basename, join } from "node:path";`. Thêm cuối file:

```js
/** Cổng dịch (A3), như `score_mt.py`: mỗi chiều không thấp hơn mốc quá mức này. */
export const REGRESSION = 0.01;
/** Mức sàn Anh→Việt, xét theo thứ tự như `FLOOR` của `score_mt.py`: LMT trước Q8_0 vì tên LMT cũng có "Q8_0". */
export const FLOORS = [
  ["LMT-60", 0.77],
  ["Q8_0", 0.83],
  ["Q4_K_M", 0.8],
];
/** Cổng nhận dạng (A4), như `A4_RELATIVE` của `bench/phase1/acceptance/gates.py`: không xấu hơn mốc quá 10% tương đối. */
export const ASR_RELATIVE = 0.1;

export const floorFor = (run) => FLOORS.find(([key]) => run.includes(key))?.[1] ?? null;
/** Tên lượt mà `score_mt.py` đặt cho kết quả `latency-bench mt-eval` (biến thể plain) của file model. */
export const mtRunName = (modelPath) => `${basename(modelPath).replace(/\.gguf$/, "")}-plain`;

/**
 * Cổng dịch (spec mục 4.4): `report`, `baseline` là `runs` của `s7_mt-*.json`; `run` là tên lượt. Đạt khi mỗi chiều của
 * mốc có COMET không thấp hơn quá `REGRESSION` và chấm đủ số câu, Anh→Việt không dưới mức sàn, số câu lỗi (`failed`,
 * `leaked`) không nhiều hơn mốc.
 */
export function gateMt(report, baseline, run) {
  const now = report[run];
  const base = baseline[run];
  if (!now) return { pass: false, rows: [], problems: [`kết quả không có lượt ${run}`] };
  if (!base) return { pass: false, rows: [], problems: [`mốc không có lượt ${run}`] };
  const rows = [];
  const problems = [];
  for (const dir of Object.keys(base).sort()) {
    const b = base[dir];
    const n = now[dir];
    if (b.comet === undefined) continue;
    if (n?.comet === undefined) {
      problems.push(`${dir}: thiếu COMET`);
      continue;
    }
    if (n.n < b.n) problems.push(`${dir}: chỉ chấm ${n.n}/${b.n} câu`);
    const diff = n.comet - b.comet;
    const ok = diff >= -REGRESSION;
    if (!ok) problems.push(`${dir}: COMET ${n.comet.toFixed(3)} thấp hơn mốc ${b.comet.toFixed(3)} quá ${REGRESSION}`);
    rows.push({ dir, baseline: b.comet, result: n.comet, diff, ok });
  }
  const floor = floorFor(run);
  const enVi = now["en->vi"]?.comet;
  if (floor !== null && !(enVi >= floor)) problems.push(`en->vi ${enVi?.toFixed(3)} dưới mức sàn ${floor}`);
  const errors = (runs) => Object.values(runs).reduce((sum, d) => sum + (d.failed ?? 0) + (d.leaked ?? 0), 0);
  if (errors(now) > errors(base)) problems.push(`số câu lỗi ${errors(now)} nhiều hơn mốc ${errors(base)}`);
  return { pass: problems.length === 0, rows, problems };
}

/** Cổng nhận dạng (spec mục 4.4): mỗi nhóm của mốc (`a4_*.json`) có WER/CER không xấu hơn quá `ASR_RELATIVE`. */
export function gateAsr(result, baseline) {
  const rows = [];
  const problems = [];
  for (const group of Object.keys(baseline).sort()) {
    const metric = "cer" in baseline[group] ? "cer" : "wer";
    const base = baseline[group][metric];
    const now = result[group]?.[metric];
    if (now === undefined) {
      problems.push(`thiếu nhóm ${group}`);
      continue;
    }
    const ok = now <= base * (1 + ASR_RELATIVE) + 1e-12;
    if (!ok) problems.push(`${group}: ${metric.toUpperCase()} ${now.toFixed(3)} xấu hơn mốc ${base.toFixed(3)} quá 10%`);
    rows.push({ group, metric, baseline: base, result: now, ok });
  }
  return { pass: rows.length > 0 && problems.length === 0, rows, problems };
}

/** Bảng Markdown của một lượt cổng kiểm, kèm kết luận. */
export function gateTable(gate) {
  const mt = gate.rows.some((r) => r.dir !== undefined);
  const lines = mt
    ? [
        "| Chiều | Mốc | Bản mới | Chênh | Kết luận |",
        "|---|---|---|---|---|",
        ...gate.rows.map(
          (r) =>
            `| ${r.dir} | ${r.baseline.toFixed(3)} | ${r.result.toFixed(3)} | ${r.diff >= 0 ? "+" : ""}${r.diff.toFixed(3)} | ${r.ok ? "đạt" : "THỤT LÙI"} |`,
        ),
      ]
    : [
        "| Nhóm | Mốc | Bản mới | Kết luận |",
        "|---|---|---|---|",
        ...gate.rows.map(
          (r) =>
            `| ${r.group} (${r.metric.toUpperCase()}) | ${r.baseline.toFixed(3)} | ${r.result.toFixed(3)} | ${r.ok ? "đạt" : "XẤU HƠN"} |`,
        ),
      ];
  lines.push("", gate.pass ? "Cổng kiểm: ĐẠT." : `Cổng kiểm: KHÔNG ĐẠT.\n- ${gate.problems.join("\n- ")}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: mọi test pass. Nếu test "cổng kiểm trên mốc thật" hỏng vì một nhóm A4 của mốc có `wer` bằng 0 hay thiếu số, đọc nhóm đó trong file JSON rồi báo lại (không nới luật để qua test).

- [ ] **Step 5: Commit**

```bash
cd $W && git add scripts/models/update-lib.mjs scripts/models/update.test.mjs && git commit -m "feat(models): luật cổng kiểm A3, A4 cho bản model mới

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chuẩn bị bản mới

**Files:**
- Create: `scripts/models/update-prepare.mjs`
- Modify: `scripts/models/update-io.mjs` (thêm `fetchPublished`)
- Modify: `scripts/models/update.test.mjs`

- [ ] **Step 1: Viết test**

Trong `update.test.mjs`, thêm import:

```js
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { prepare } from "./update-prepare.mjs";
import { fetchPublished } from "./update-io.mjs";
```

(gộp `existsSync` vào dòng import `node:fs` sẵn có; gộp `fetchPublished` vào dòng import `./update-io.mjs` sẵn có.)

Thêm cuối file:

```js
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
  await assert.rejects(prepare(io, work, "m", hfEntry, wrong, "m-Q8_0.gguf"), /không khớp nguồn/);
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
    /không phải eeeeeee/,
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
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: FAIL, `Cannot find module …/update-prepare.mjs`.

- [ ] **Step 3: Thêm `fetchPublished` vào `update-io.mjs`**

Đổi dòng import `./update-lib.mjs` thành:

```js
import { MANIFEST_URL, PUBLIC_BASE, detect, latestBody, sameSignedBody } from "./update-lib.mjs";
```

Thêm cuối file:

```js
/**
 * File đang phát hành của một mục manifest: tải qua tên miền công khai về `work/published/<id>/<12 ký tự SHA>/`, kiểm
 * SHA-256 với manifest. Trả đường dẫn.
 */
export async function fetchPublished(io, work, file) {
  const dest = join(work, "published", file.id, file.sha256.slice(0, 12), file.file);
  fetchFile(io, PUBLIC_BASE + file.url, dest);
  const sha = await sha256File(dest);
  if (sha !== file.sha256) {
    rmSync(dest, { force: true });
    throw new Error(`${file.url} tải về có SHA-256 ${sha.slice(0, 12)}…, manifest ghi ${file.sha256.slice(0, 12)}…`);
  }
  return dest;
}
```

- [ ] **Step 4: Viết `update-prepare.mjs`**

```js
// Bước chuẩn bị của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md mục
// 4.3): tải hay tự chuyển bản mới vào target/models-update/<id>/<revision>/, kiểm nội dung khớp nguồn.
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GH_RAW, HF_RESOLVE, fetchFile, gitBlobId, sha256File } from "./update-io.mjs";

/**
 * Kiểm file khớp định danh nội dung ở nguồn (`sha256:<hex>` hay `blob:<mã blob git>`); trả SHA-256 của file. Mã blob tự
 * tính (`gitBlobId`), không qua `git hash-object`: file nằm trong repo nên git sẽ đổi xuống dòng theo .gitattributes.
 */
export async function verifyContent(path, content) {
  const sha = await sha256File(path);
  const got = content.startsWith("blob:") ? `blob:${gitBlobId(path)}` : `sha256:${sha}`;
  if (got !== content) {
    throw new Error(`${path} không khớp nguồn (${got.slice(0, 20)}…, nguồn ghi ${content.slice(0, 20)}…): xóa file đó rồi chạy lại.`);
  }
  return sha;
}

/**
 * Bản mới của mục `id` trên máy: `{ path, bytes, sha256 }`. `next`: kết quả `detect` (`revision`, `content` hay `inputs`);
 * `file`: tên file trên máy (trường `file` của manifest).
 */
export async function prepare(io, work, id, entry, next, file) {
  const dir = join(work, id, next.revision);
  mkdirSync(dir, { recursive: true });
  if (entry.source === "hf-convert") return convert(io, work, dir, entry, next, file);
  const url =
    entry.source === "hf-file"
      ? HF_RESOLVE(entry.repo, next.revision, entry.path)
      : GH_RAW(entry.repo, next.revision, entry.path);
  const path = fetchFile(io, url, join(dir, file));
  const sha256 = await verifyContent(path, next.content);
  return { path, bytes: statSync(path).size, sha256 };
}

/**
 * Tự chuyển như `bench/2026-10-21-goi-nhanh/CONVERT.md`: llama.cpp đúng tag và commit, môi trường Python dựng bằng uv từ
 * requirements của chính llama.cpp, tải repo theo revision mới, chuyển hai lần; SHA-256 hai lần phải trùng (tái lập được).
 */
async function convert(io, work, dir, entry, next, file) {
  const c = entry.convert;
  const tools = join(work, "convert");
  const llama = join(tools, `llama.cpp-${c.llama_tag}`);
  if (!existsSync(llama)) {
    io.run("git", ["clone", "--depth", "1", "--branch", c.llama_tag, "https://github.com/ggml-org/llama.cpp", llama], {
      inherit: true,
    });
  }
  const head = io.run("git", ["-C", llama, "rev-parse", "HEAD"]).trim();
  if (head !== c.llama_commit) {
    throw new Error(`llama.cpp ${c.llama_tag} ở ${llama} là commit ${head}, không phải ${c.llama_commit.slice(0, 7)}: xóa thư mục đó rồi chạy lại.`);
  }
  const venv = join(tools, "venv");
  const python = join(venv, "bin", "python");
  if (!existsSync(python)) {
    io.run("uv", ["venv", "-p", c.python, venv], { inherit: true });
    io.run(
      "uv",
      [
        "pip",
        "install",
        "--python",
        python,
        "--index-strategy",
        "unsafe-best-match",
        "-r",
        join(llama, "requirements", "requirements-convert_hf_to_gguf.txt"),
        "huggingface_hub",
      ],
      { inherit: true },
    );
  }
  writeFileSync(join(dir, "convert-env.txt"), io.run("uv", ["pip", "freeze", "--python", python]));
  const src = join(dir, "src");
  const download = `from huggingface_hub import snapshot_download; snapshot_download(${JSON.stringify(entry.repo)}, revision=${JSON.stringify(next.revision)}, local_dir=${JSON.stringify(src)})`;
  io.run(python, ["-c", download], { inherit: true });
  const outs = [join(dir, file), join(dir, `${file}.lan-2`)];
  for (const out of outs) {
    if (existsSync(out)) continue;
    io.run(python, [join(llama, "convert_hf_to_gguf.py"), src, "--outtype", c.outtype, "--outfile", `${out}.part`], {
      inherit: true,
    });
    renameSync(`${out}.part`, out);
  }
  const [first, second] = [await sha256File(outs[0]), await sha256File(outs[1])];
  if (first !== second) {
    rmSync(outs[0]);
    rmSync(outs[1]);
    throw new Error(`Chuyển hai lần ra hai SHA-256 khác nhau (${first.slice(0, 12)}…, ${second.slice(0, 12)}…): không tái lập được, không đăng.`);
  }
  rmSync(outs[1]);
  return { path: outs[0], bytes: statSync(outs[0]).size, sha256: first };
}
```

Ghi chú: lần chạy lại sau khi đã bỏ `.lan-2` sẽ chuyển lại lần hai và so lại; như vậy mỗi lần chạy đều kiểm tái lập.

- [ ] **Step 5: Chạy test, phải qua**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: mọi test pass.

- [ ] **Step 6: Commit**

```bash
cd $W && git add scripts/models/update-prepare.mjs scripts/models/update-io.mjs scripts/models/update.test.mjs && git commit -m "feat(models): tải hay tự chuyển bản model mới, kiểm khớp nguồn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Chạy cổng kiểm

**Files:**
- Create: `scripts/models/update-gate.mjs`
- Modify: `scripts/models/update.test.mjs`

- [ ] **Step 1: Viết test**

Thêm import `import { runGate } from "./update-gate.mjs";` và cuối file:

```js
/** Đường dẫn cổng kiểm trong thư mục tạm; `latency-bench` là "lb", `asr-worker` là "aw". */
function gatePaths(root) {
  const paths = {
    repo: root,
    results: join(root, "results"),
    mtOutputs: join(root, "mt"),
    mtTestset: join(root, "mt", "testset.jsonl"),
    asrData: join(root, "asr"),
    llamaServer: "ls",
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
  assert.match(io.calls[1], new RegExp(`^lb mt-eval .*--out-dir ${join(paths.mtOutputs, "outputs-nhan")}$`));
  assert.match(io.calls[2], /^uv run --no-project --python 3\.12 .*unbabel-comet==2\.2\.7.* python bench\/phase0\/mt\/score_mt\.py --outputs .* --label nhan$/);
});

test("runGate: model không chạy được bằng engine của app thì báo cần nâng engine", (t) => {
  const root = temp(t);
  const io = fakeIo({ run: (cmd, args) => (args.includes("--limit") ? new Error("llama-server thoát mã 1") : "") });
  const entry = { gate: { kind: "mt", prompt: "hy-mt2", baseline: "base.json" } };
  assert.throws(() => runGate(io, entry, "/x/m.gguf", "nhan", join(root, "out"), gatePaths(root)), /cần nâng engine/);
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
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: FAIL, `Cannot find module …/update-gate.mjs`.

- [ ] **Step 3: Viết `update-gate.mjs`**

```js
// Cổng kiểm của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md mục 4.4):
// chạy model bằng đúng engine của app (llama-server b11146 của tools/, asr-worker build từ workspace), chấm A3 (dịch) hay
// A4 (nhận dạng), so với mốc của model đang phát hành.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO } from "./lib.mjs";
import { gateAsr, gateMt, gateTable, mtRunName } from "./update-lib.mjs";

const TARGET = process.env.CARGO_TARGET_DIR ?? resolve(REPO, "target");

/** Đường dẫn của cổng kiểm; test thay bằng thư mục tạm. */
export const GATE_PATHS = {
  repo: REPO,
  results: resolve(REPO, "bench/phase0/results"),
  mtOutputs: resolve(REPO, "bench/phase0/data/mt"),
  mtTestset: resolve(REPO, "bench/phase0/data/mt/testset_phase0.jsonl"),
  asrData: resolve(REPO, "bench/phase0/data/asr"),
  llamaServer: resolve(REPO, "tools/llama-b11146/macos-arm64/llama-b11146/llama-server"),
  latencyBench: resolve(TARGET, "release/latency-bench"),
  asrWorker: resolve(TARGET, "release/asr-worker"),
};

/** Môi trường chấm, như bench/2026-10-21-goi-nhanh/README.md (COMET) và bench/phase0/asr/score_asr.py (WER/CER). */
const COMET = ["unbabel-comet==2.2.7", "transformers==4.57.6", "torch==2.14.1", "setuptools<81", "sacrebleu==2.6.0"];
const JIWER = ["jiwer==4.0.0", "opencc==1.4.2"];
const uvPython = (deps, args) => ["run", "--no-project", "--python", "3.12", ...deps.flatMap((d) => ["--with", d]), "python", ...args];

/** Build công cụ đo; `asr-worker` có cùng features với bản phát hành trên Mac (scripts/copy-sidecars.sh). */
export function buildTools(io, paths = GATE_PATHS) {
  for (const p of [paths.llamaServer, paths.mtTestset, join(paths.asrData, "manifest.jsonl")]) {
    if (!existsSync(p)) throw new Error(`Thiếu ${p} (dữ liệu thử và llama-server: xem bench/phase0/README.md).`);
  }
  io.run("cargo", ["build", "--release", "--locked", "-p", "latency-bench"], { inherit: true });
  io.run("cargo", ["build", "--release", "--locked", "-p", "asr-worker", "--features", "metal,shared-encode"], { inherit: true });
}

/**
 * Chạy cổng kiểm của `entry` với file `model`. `label`: nhãn của lượt (tên kết quả chấm); `outDir`: nơi giữ kết quả chấm
 * và `gate.md`. Trả `{ pass, rows, problems, result }`; `result` là JSON kết quả, dùng làm mốc lần sau.
 */
export function runGate(io, entry, model, label, outDir, paths = GATE_PATHS) {
  mkdirSync(outDir, { recursive: true });
  const gate = entry.gate.kind === "mt" ? mtGate(io, entry, model, label, outDir, paths) : asrGate(io, entry, model, label, outDir, paths);
  writeFileSync(join(outDir, "gate.md"), `${gateTable(gate)}\n`);
  return gate;
}

function engineFailed(engine, error) {
  return new Error(`Model không chạy được bằng ${engine} của app (cần nâng engine trong app; không đăng): ${error.message}`);
}

function mtGate(io, entry, model, label, outDir, paths) {
  const evaluate = (out, extra = []) =>
    io.run(
      paths.latencyBench,
      ["mt-eval", "--testset", paths.mtTestset, "--llama-server", paths.llamaServer, "--model", model, "--prompt", entry.gate.prompt, "--out-dir", out, ...extra],
      { inherit: true },
    );
  try {
    evaluate(join(outDir, "chay-thu"), ["--limit", "2"]);
  } catch (e) {
    throw engineFailed("llama-server", e);
  }
  const outputs = join(paths.mtOutputs, `outputs-${label}`);
  evaluate(outputs);
  io.run("uv", uvPython(COMET, ["bench/phase0/mt/score_mt.py", "--outputs", outputs, "--label", label]), { cwd: paths.repo, inherit: true });
  const result = moveResults(`s7_mt-${label}`, outDir, paths);
  const report = JSON.parse(readFileSync(result, "utf8")).runs;
  const baseline = JSON.parse(readFileSync(resolve(paths.repo, entry.gate.baseline), "utf8")).runs;
  return { ...gateMt(report, baseline, mtRunName(model)), result };
}

function asrGate(io, entry, model, label, outDir, paths) {
  // `path` của clip là tương đối với file manifest, nên bản chạy thử phải nằm cùng thư mục với manifest.jsonl.
  const manifest = join(paths.asrData, "manifest.jsonl");
  const smoke = join(paths.asrData, "manifest-chay-thu.jsonl");
  const lines = readFileSync(manifest, "utf8").split("\n").filter(Boolean);
  writeFileSync(smoke, `${lines.slice(0, 2).join("\n")}\n`);
  const evaluate = (list, out) =>
    io.run(
      paths.latencyBench,
      ["asr-eval", "--manifest", list, "--asr-worker", paths.asrWorker, "--asr-model", model, "--out", out, "--log-dir", join(paths.asrData, "logs")],
      { inherit: true },
    );
  try {
    evaluate(smoke, join(outDir, "chay-thu.jsonl"));
  } catch (e) {
    throw engineFailed("asr-worker", e);
  }
  const out = join(paths.asrData, `out-${label}.jsonl`);
  evaluate(manifest, out);
  io.run("uv", uvPython(JIWER, ["bench/phase0/asr/score_asr.py", out]), { cwd: paths.repo, inherit: true });
  const result = moveResults(`a4_${label}`, outDir, paths);
  const baseline = JSON.parse(readFileSync(resolve(paths.repo, entry.gate.baseline), "utf8"));
  return { ...gateAsr(JSON.parse(readFileSync(result, "utf8")), baseline), result };
}

/** score_mt.py, score_asr.py ghi vào bench/phase0/results/; chuyển sang `outDir` để không lẫn với các mốc của Phase 0. */
function moveResults(stem, outDir, paths) {
  for (const ext of [".json", ".md"]) {
    const from = join(paths.results, `${stem}${ext}`);
    if (existsSync(from)) renameSync(from, join(outDir, `${stem}${ext}`));
  }
  const result = join(outDir, `${stem}.json`);
  if (!existsSync(result)) throw new Error(`Không thấy kết quả chấm ${stem}.json.`);
  return result;
}
```

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: mọi test pass.

- [ ] **Step 5: Commit**

```bash
cd $W && git add scripts/models/update-gate.mjs scripts/models/update.test.mjs && git commit -m "feat(models): chạy cổng kiểm A3, A4 bằng engine của app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `pnpm models:update --gate-only <id>`

**Files:**
- Modify: `scripts/models/update.mjs`

- [ ] **Step 1: Thêm chế độ**

Đổi phần import của `update.mjs`:

```js
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { builtInKeys, REPO } from "./lib.mjs";
import { checkTable, checkUpstream, gateTable, latestBody, parseArgs } from "./update-lib.mjs";
import { checkLiveManifest, checkSources, createIo, fetchPublished } from "./update-io.mjs";
import { buildTools, runGate } from "./update-gate.mjs";
```

Thêm hàm ngay trước `async function main`:

```js
/** Cổng kiểm với file đang phát hành của `id` (hiệu chỉnh: phải đạt). Kết quả giữ trong target/, không commit. */
async function gateOnly(io, id) {
  const entry = readJson(PATHS.upstream).entries[id];
  if (!entry) throw new Error(`upstream.json không có ${id}.`);
  if (entry.gate.kind !== "mt" && entry.gate.kind !== "asr") {
    throw new Error(`${id} không có cổng kiểm (gate.kind là ${entry.gate.kind}).`);
  }
  const file = readJson(latestBody(PATHS.released).path).files.find((f) => f.id === id);
  const model = await fetchPublished(io, PATHS.work, file);
  buildTools(io);
  const label = `gate-only-${id}-${file.sha256.slice(0, 12)}`;
  const gate = runGate(io, entry, model, label, join(PATHS.work, "gate-only", label));
  console.log(`\n${id}: file đang phát hành so với mốc ${entry.gate.baseline}\n\n${gateTable(gate)}`);
  return gate.pass ? 0 : 1;
}
```

Trong `main`, thêm trước dòng `throw new Error(\`Chế độ ${args.mode} chưa có …\`)`:

```js
  if (args.mode === "gate-only") return gateOnly(io, args.id);
```

và đổi thông điệp của dòng `throw` đó thành `Chế độ ${args.mode} chưa có (kế hoạch 03 của cap-nhat-model).`.

- [ ] **Step 2: Chạy toàn bộ test script**

Run: `cd $W && node --test scripts/models/update.test.mjs scripts/models/manifest.test.mjs`
Expected: mọi test pass.

- [ ] **Step 3: Commit**

```bash
cd $W && git add scripts/models/update.mjs && git commit -m "feat(models): pnpm models:update --gate-only để hiệu chỉnh cổng kiểm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hiệu chỉnh cổng kiểm trên máy thật

Cổng kiểm phải đạt khi chạy với chính file đang phát hành. Không đạt nghĩa là cách chạy khác lúc đo mốc (cờ, bản code, môi trường chấm): phải tìm ra nguyên nhân, không nới ngưỡng.

- [ ] **Step 1: Báo chủ dự án trước**

Nhắn: "Tôi sắp chạy cổng kiểm với 5 model đang phát hành (tải khoảng 4,6 GB vào `target/` của worktree, máy bận khoảng 1–2 giờ: dịch 620 câu mỗi model dịch, nhận dạng 548 clip mỗi model whisper, chấm COMET trên CPU). Anh có muốn chạy lúc khác không?" Chờ trả lời.

- [ ] **Step 2: Chuẩn bị worktree**

Dữ liệu thử và `tools/` chỉ có ở thư mục chính (bị `.gitignore`), nên nối sang:

```bash
cd $W && ln -s $R/bench/phase0/data bench/phase0/data && ln -s $R/tools tools && git status --short
```

Expected: `git status` không hiện hai symlink (bị `.gitignore`). `df -h $W` còn trống trên 10 GB.

- [ ] **Step 3: Chạy từng model**

```bash
cd $W && pnpm models:update --gate-only hy-mt2-1.8b-q8_0; echo "mã $?"
cd $W && pnpm models:update --gate-only hy-mt2-1.8b-q4_k_m; echo "mã $?"
cd $W && pnpm models:update --gate-only lmt-60-0.6b-q8_0; echo "mã $?"
cd $W && pnpm models:update --gate-only whisper-large-v3-turbo-q5_0; echo "mã $?"
cd $W && pnpm models:update --gate-only whisper-small-q5_1; echo "mã $?"
```

Chạy nền từng lệnh (`run_in_background`), chờ thông báo xong. Expected: mỗi lệnh in bảng và "Cổng kiểm: ĐẠT.", `mã 0`. Ghi lại các bảng.

- [ ] **Step 3b: Kiểm chuyển LMT còn tái lập được bản đã phát hành**

Chuyển hai lần trong cùng môi trường chỉ chứng minh hai lần chạy giống nhau. Phải kiểm thêm: môi trường chuyển dựng hôm
nay (requirements của llama.cpp b11146, không ghim bản gói) có ra đúng file đang phát hành không.

```bash
cd $W && node --input-type=module -e '
import { readFileSync } from "node:fs";
import { createIo } from "./scripts/models/update-io.mjs";
import { prepare } from "./scripts/models/update-prepare.mjs";
const id = "lmt-60-0.6b-q8_0";
const e = JSON.parse(readFileSync("scripts/models/upstream.json", "utf8")).entries[id];
const r = await prepare(createIo(), "target/models-update", id, e, { revision: e.revision, inputs: e.inputs }, "LMT-60-0.6B-Q8_0.gguf");
console.log(r.sha256);'
```

Expected: `7b64cce458930ca3b6dd6da3d04503b309fdaacb6190eb6f9865263b6d67f55b` (SHA-256 của file đang phát hành,
`bench/2026-10-21-goi-nhanh/CONVERT.md`). Khác thì môi trường hôm nay không tái lập bản cũ: so `convert-env.txt` với danh
sách gói trong CONVERT.md, báo chủ dự án, đề xuất ghim bản gói trong `convert` của upstream.json (kế hoạch riêng).

- [ ] **Step 4: Nếu một lượt không đạt**

Dùng superpowers:systematic-debugging. Các nghi vấn theo thứ tự:
1. Cờ của `asr-eval` khác lúc đo mốc A4 (mốc `-final` đo với cấu hình chốt ở spec chính §6.4: sàn `audio_ctx` 512 đã có sẵn trong công thức, nên không cần `--min-ctx`; so dòng đầu `decode_mode` của kết quả với mốc).
2. Code dịch đã đổi từ lúc đo mốc (xem `git log -- crates/pipeline/src/translate.rs crates/pipeline/src/prompt.rs` sau ngày của mốc).
3. Môi trường COMET khác (bản `torch`).

Báo chủ dự án kèm bảng và nguyên nhân. Nếu nguyên nhân là code đã đổi hợp lệ, đề xuất đo lại mốc bằng chính `--gate-only` rồi trỏ `gate.baseline` sang kết quả mới (chủ dự án quyết).

- [ ] **Step 4b: Ghi kết quả**

Ghi các bảng vào `docs/superpowers/plans/2026-10-23-cap-nhat-model-02-chuan-bi-cong-kiem.md`, mục "Kết quả hiệu chỉnh" ở cuối file (ngày, số COMET/WER từng chiều, đạt/không). Commit:

```bash
cd $W && git add docs/superpowers/plans/2026-10-23-cap-nhat-model-02-chuan-bi-cong-kiem.md && git commit -m "docs(plan): kết quả hiệu chỉnh cổng kiểm với model đang phát hành

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Kết quả hiệu chỉnh

(Điền ở Task 5.)
