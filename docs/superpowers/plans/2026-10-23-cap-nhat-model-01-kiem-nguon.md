# Cập nhật model, kế hoạch 01: `upstream.json` và `pnpm models:update --check`

> **Ghi chú sau thực thi (2026-10-23):** kế hoạch đã thực thi xong. Sau các lượt rà, code cuối cùng khác một số đoạn mã trong văn bản này (ví dụ thư mục trạng thái `.models-update/`, luồng ở `update-flow.mjs`, `gateTable(gate, kind)`, cách cập nhật icon khay). Khi cần đối chiếu, tin code và spec, không tin đoạn mã ở đây.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm models:update --check` đọc nguồn gốc các model (Hugging Face, GitHub), so với bản đang phát hành, in bảng "đang phát hành / mới nhất ở nguồn". Không tải model, không đăng gì.

**Architecture:** `scripts/models/upstream.json` ghi nguồn gốc từng file. `update-lib.mjs` là phần thuần (đọc tham số, so bản mới, kiểm `upstream.json`, in bảng). `update-io.mjs` gom mọi thao tác ra ngoài (chạy lệnh, curl, băm file) sau một đối tượng `io` để test thay bằng bản giả. `update.mjs` là lệnh. Kế hoạch 02 thêm chuẩn bị và cổng kiểm, kế hoạch 03 thêm phần đăng và quay lại.

**Tech Stack:** Node 24 (ESM, `node:test`), curl, API của Hugging Face và GitHub.

**Spec:** `docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md` mục 3, 4.1, 4.2, 9.

**Quy ước:** `W=/Users/dtphong/Desktop/software_business/meeting-translator-work/cap-nhat-model`. Mọi lệnh bắt đầu bằng `cd $W &&`. Không push.

---

## Cấu trúc file

| File | Việc |
|---|---|
| Tạo `scripts/models/upstream.json` | Nguồn gốc từng file của manifest (mục 4.1 của spec) |
| Tạo `scripts/models/update-lib.mjs` | Phần thuần: tham số, so bản mới, kiểm `upstream.json`, bảng |
| Tạo `scripts/models/update-io.mjs` | Chạy lệnh, curl, băm file; `checkSources`, `checkLiveManifest` |
| Tạo `scripts/models/update.mjs` | Lệnh `pnpm models:update` |
| Tạo `scripts/models/update.test.mjs` | Test |
| Sửa `package.json` | thêm script `models:update` |
| Sửa `.github/workflows/ci.yml:53` | chạy thêm `update.test.mjs` |

Giao diện `io` (dùng chung cả ba kế hoạch): `run(cmd, args, opts)` (trả stdout, ném khi lỗi), `succeeds(cmd, args)`, `text(url)`, `json(url)`, `download(url, dest)` (trả `dest`), `sleep(ms)`.

---

### Task 1: `upstream.json`

**Files:**
- Create: `scripts/models/upstream.json`

- [ ] **Step 1: Tạo file**

Giá trị đã đối chiếu ngày 2026-10-23: SHA-256 của file LFS khớp `sha256` trong `scripts/models/released/body-3.json`; mã blob của hai file giấy phép khớp `git hash-object` của bản đang phát hành; `inputs` của LMT lấy từ API Hugging Face ở revision `dd18984…`.

```json
{
  "_note": "Nguồn gốc các file của manifest model cho `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md mục 4.1). Khóa là `id` của models.config.json. `content`: `sha256:<hex>` (file LFS trên Hugging Face, file tải từ GitHub) hay `blob:<mã blob git>` (file thường trên Hugging Face). `gate.kind`: `mt`, `asr`, `none` (không chạy cổng kiểm), `report` (chỉ báo, đổi bằng tay). `history`: mỗi lần phát hành một dòng, `sequence` là số manifest đầu tiên có bản đó. Lệnh tự sửa file này khi đăng hay quay lại; chỉ sửa tay khi thêm hay bỏ mục.",
  "entries": {
    "whisper-large-v3-turbo-q5_0": {
      "source": "hf-file",
      "repo": "ggerganov/whisper.cpp",
      "path": "ggml-large-v3-turbo-q5_0.bin",
      "revision": "5359861c739e955e79d9a303bcbc70fb988958b1",
      "content": "sha256:394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
      "license": "mit",
      "version_prefix": "whisper.cpp-",
      "r2_dir": "whisper",
      "notice": "notice",
      "gate": {
        "kind": "asr",
        "baseline": "bench/phase0/results/a4_m4pro-turbo-final.json"
      },
      "history": [
        {
          "sequence": 1,
          "revision": "5359861c739e955e79d9a303bcbc70fb988958b1",
          "content": "sha256:394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
          "baseline": "bench/phase0/results/a4_m4pro-turbo-final.json"
        }
      ]
    },
    "whisper-small-q5_1": {
      "source": "hf-file",
      "repo": "ggerganov/whisper.cpp",
      "path": "ggml-small-q5_1.bin",
      "revision": "5359861c739e955e79d9a303bcbc70fb988958b1",
      "content": "sha256:ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
      "license": "mit",
      "version_prefix": "whisper.cpp-",
      "r2_dir": "whisper",
      "notice": "notice",
      "gate": {
        "kind": "asr",
        "baseline": "bench/phase0/results/a4_m4pro-small-final.json"
      },
      "history": [
        {
          "sequence": 1,
          "revision": "5359861c739e955e79d9a303bcbc70fb988958b1",
          "content": "sha256:ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
          "baseline": "bench/phase0/results/a4_m4pro-small-final.json"
        }
      ]
    },
    "hy-mt2-1.8b-q8_0": {
      "source": "hf-file",
      "repo": "tencent/Hy-MT2-1.8B-GGUF",
      "path": "Hy-MT2-1.8B-Q8_0.gguf",
      "revision": "a0c709d9fac510f2c807aa3af52872340dc37a4a",
      "content": "sha256:5c3fe0b1408a5ceb0143184ef247b11b579c525f4b02b060e6c851bb76fef1a4",
      "license": "apache-2.0",
      "version_prefix": "",
      "r2_dir": "hy-mt2",
      "notice": "notice",
      "gate": {
        "kind": "mt",
        "prompt": "hy-mt2",
        "baseline": "bench/phase0/results/s7_mt-gd1-a3.json"
      },
      "history": [
        {
          "sequence": 1,
          "revision": "a0c709d9fac510f2c807aa3af52872340dc37a4a",
          "content": "sha256:5c3fe0b1408a5ceb0143184ef247b11b579c525f4b02b060e6c851bb76fef1a4",
          "baseline": "bench/phase0/results/s7_mt-gd1-a3.json"
        }
      ]
    },
    "hy-mt2-1.8b-q4_k_m": {
      "source": "hf-file",
      "repo": "tencent/Hy-MT2-1.8B-GGUF",
      "path": "Hy-MT2-1.8B-Q4_K_M.gguf",
      "revision": "a0c709d9fac510f2c807aa3af52872340dc37a4a",
      "content": "sha256:dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699",
      "license": "apache-2.0",
      "version_prefix": "",
      "r2_dir": "hy-mt2",
      "notice": "notice",
      "gate": {
        "kind": "mt",
        "prompt": "hy-mt2",
        "baseline": "bench/phase0/results/s7_mt-gd1-a3.json"
      },
      "history": [
        {
          "sequence": 1,
          "revision": "a0c709d9fac510f2c807aa3af52872340dc37a4a",
          "content": "sha256:dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699",
          "baseline": "bench/phase0/results/s7_mt-gd1-a3.json"
        }
      ]
    },
    "hy-mt2-license": {
      "source": "hf-file",
      "repo": "tencent/Hy-MT2-1.8B-GGUF",
      "path": "LICENSE.txt",
      "revision": "a0c709d9fac510f2c807aa3af52872340dc37a4a",
      "content": "blob:271c97261848d7b61366d20262762f5c47b4a0c6",
      "license": "apache-2.0",
      "version_prefix": "",
      "r2_dir": "hy-mt2",
      "gate": {
        "kind": "none"
      },
      "history": [
        {
          "sequence": 1,
          "revision": "a0c709d9fac510f2c807aa3af52872340dc37a4a",
          "content": "blob:271c97261848d7b61366d20262762f5c47b4a0c6"
        }
      ]
    },
    "lmt-60-0.6b-q8_0": {
      "source": "hf-convert",
      "repo": "NiuTrans/LMT-60-0.6B",
      "revision": "dd189845cdc73346cef33c7a94f4b8bd8efdd4eb",
      "inputs": {
        "added_tokens.json": "blob:b54f9135e44c1e81047e8d05cb027af8bc039eed",
        "chat_template.jinja": "blob:699ff8df401fe4788525e9c1f9b86a99eadd6230",
        "config.json": "blob:bee635756e3cb6f65e3c2324fd6efe6ea7d949d6",
        "generation_config.json": "blob:89cb4b5ab4eefe1e2da8d40c59f433c74c4919dd",
        "merges.txt": "blob:31349551d90c7606f325fe0f11bbb8bd5fa0d7c7",
        "model.safetensors": "sha256:c48c3b8d7b04d3c6e56452fa51ddefc03921043b0f70641cb80c5d3ac71b73e6",
        "special_tokens_map.json": "blob:ac23c0aaa2434523c494330aeb79c58395378103",
        "tokenizer.json": "sha256:aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4",
        "tokenizer_config.json": "blob:ddaf69808214a44fdd26d3785b66c1367c78277a",
        "vocab.json": "blob:4783fe10ac3adce15ac8f358ef5462739852c569"
      },
      "convert": {
        "llama_tag": "b11146",
        "llama_commit": "7fe450e19305b828c199d602c23a8337aaa1f03b",
        "outtype": "q8_0",
        "python": "3.12"
      },
      "license": "apache-2.0",
      "version_prefix": "",
      "r2_dir": "lmt-60",
      "notice": "notice-fast",
      "gate": {
        "kind": "mt",
        "prompt": "lmt",
        "baseline": "bench/phase0/results/s7_mt-goi-nhanh.json"
      },
      "history": [
        {
          "sequence": 3,
          "revision": "dd189845cdc73346cef33c7a94f4b8bd8efdd4eb",
          "inputs": {
            "added_tokens.json": "blob:b54f9135e44c1e81047e8d05cb027af8bc039eed",
            "chat_template.jinja": "blob:699ff8df401fe4788525e9c1f9b86a99eadd6230",
            "config.json": "blob:bee635756e3cb6f65e3c2324fd6efe6ea7d949d6",
            "generation_config.json": "blob:89cb4b5ab4eefe1e2da8d40c59f433c74c4919dd",
            "merges.txt": "blob:31349551d90c7606f325fe0f11bbb8bd5fa0d7c7",
            "model.safetensors": "sha256:c48c3b8d7b04d3c6e56452fa51ddefc03921043b0f70641cb80c5d3ac71b73e6",
            "special_tokens_map.json": "blob:ac23c0aaa2434523c494330aeb79c58395378103",
            "tokenizer.json": "sha256:aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4",
            "tokenizer_config.json": "blob:ddaf69808214a44fdd26d3785b66c1367c78277a",
            "vocab.json": "blob:4783fe10ac3adce15ac8f358ef5462739852c569"
          },
          "baseline": "bench/phase0/results/s7_mt-goi-nhanh.json"
        }
      ]
    },
    "lmt-60-license": {
      "source": "hf-file",
      "repo": "Qwen/Qwen3-0.6B-Base",
      "path": "LICENSE",
      "revision": "da87bfb608c14b7cf20ba1ce41287e8de496c0cd",
      "content": "blob:6634c8cc3133b3848ec74b9f275acaaa1ea618ab",
      "license": "apache-2.0",
      "version_prefix": "",
      "r2_dir": "lmt-60",
      "gate": {
        "kind": "none"
      },
      "history": [
        {
          "sequence": 3,
          "revision": "da87bfb608c14b7cf20ba1ce41287e8de496c0cd",
          "content": "blob:6634c8cc3133b3848ec74b9f275acaaa1ea618ab"
        }
      ]
    },
    "silero-vad-v6.2.3": {
      "source": "github-release",
      "repo": "snakers4/silero-vad",
      "path": "src/silero_vad/data/silero_vad.onnx",
      "revision": "v6.2.3",
      "content": "sha256:1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3",
      "license": "MIT",
      "version_prefix": "",
      "r2_dir": "silero-vad",
      "gate": {
        "kind": "report"
      },
      "history": [
        {
          "sequence": 1,
          "revision": "v6.2.3",
          "content": "sha256:1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Kiểm là JSON hợp lệ**

Run: `cd $W && node -e 'JSON.parse(require("fs").readFileSync("scripts/models/upstream.json","utf8")); console.log("ok")'`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd $W && git add scripts/models/upstream.json && git commit -m "feat(models): upstream.json ghi nguồn gốc các file model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Phần thuần: tham số, so bản mới, kiểm `upstream.json`

**Files:**
- Create: `scripts/models/update-lib.mjs`
- Create: `scripts/models/update.test.mjs`

- [ ] **Step 1: Viết test**

Tạo `scripts/models/update.test.mjs`:

```js
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

void signBody;
void testKey;
```

(`signBody`, `testKey` dùng ở Task 3; dòng `void` giữ import cho tới lúc đó, Task 3 xóa hai dòng này.)

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: FAIL, `Cannot find module …/update-lib.mjs`.

- [ ] **Step 3: Viết `update-lib.mjs`**

```js
// Phần thuần của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md): đọc tham
// số, so bản ở nguồn với upstream.json, kiểm upstream.json, dựng bảng in ra. Không gọi mạng, không chạy lệnh ngoài (phần
// đó ở update-io.mjs), nên test được bằng dữ liệu mẫu.
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** URL của models.json đang phát hành; trùng `PRODUCTION_URL` của `src-tauri/src/models/source.rs` (có test). */
export const MANIFEST_URL = "https://releases.aitranslator.vn/models/models.json";
/** `url` trong manifest là tương đối so với thư mục này. */
export const PUBLIC_BASE = "https://releases.aitranslator.vn/models/";

export const USAGE = `Dùng:
  pnpm models:update                     kiểm nguồn, chuẩn bị, cổng kiểm, hỏi y/N rồi đăng
  pnpm models:update --check             chỉ kiểm nguồn, không tải, không đăng
  pnpm models:update --gate-only <id>    chạy cổng kiểm với file đang phát hành của <id>
  pnpm models:update --rollback-to <S>   quay các model về như manifest số S`;

export function parseArgs(argv) {
  if (argv.length === 0) return { mode: "update" };
  const [flag, value, ...rest] = argv;
  if (flag === "--check" && value === undefined) return { mode: "check" };
  if (flag === "--gate-only" && value && rest.length === 0) return { mode: "gate-only", id: value };
  if (flag === "--rollback-to" && value && rest.length === 0) {
    if (!/^[1-9]\d*$/.test(value)) throw new Error(`--rollback-to cần số manifest nguyên dương, không phải ${value}.`);
    return { mode: "rollback", sequence: Number(value) };
  }
  throw new Error(`Tham số không hợp lệ: ${argv.join(" ")}\n${USAGE}`);
}

/** Phần thân manifest đã phát hành có số lớn nhất trong `dir` (`body-<n>.json`). */
export function latestBody(dir) {
  const numbers = readdirSync(dir)
    .map((name) => /^body-([1-9]\d*)\.json$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  if (numbers.length === 0) throw new Error(`Không có body-<n>.json nào trong ${dir}.`);
  const sequence = Math.max(...numbers);
  return { sequence, path: join(dir, `body-${sequence}.json`) };
}

/** Định danh nội dung một file trong `siblings` của API Hugging Face: SHA-256 với file LFS, mã blob git với file thường. */
export function contentId(sibling) {
  return sibling.lfs?.sha256 ? `sha256:${sibling.lfs.sha256}` : `blob:${sibling.blobId}`;
}

/** File đầu vào của `hf-convert`: mọi file của repo trừ tài liệu (`*.md`) và `.gitattributes`. */
export function convertInputs(siblings) {
  return Object.fromEntries(
    siblings
      .filter((s) => s.rfilename !== ".gitattributes" && !s.rfilename.endsWith(".md"))
      .map((s) => [s.rfilename, contentId(s)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

const sameMap = (a, b) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

/**
 * So một mục của upstream.json với trạng thái ở nguồn. `source`:
 * - Hugging Face: `{ api }`, JSON của `/api/models/<repo>/revision/main?blobs=true`;
 * - GitHub: `{ tag, license, content }`: tag của release mới nhất, `spdx_id` giấy phép của repo, và `sha256:<hex>` của file
 *   theo dõi ở tag đó (`null` khi tag trùng bản đang dùng, không cần tải).
 * Trả `{ id, status, reason?, next? }`. `status`: `same`; `new` (đi tiếp chuẩn bị); `report` (chỉ báo, không tự đăng);
 * `stop` (dừng, cần người xem).
 */
export function detect(id, entry, source) {
  const stop = (reason) => ({ id, status: "stop", reason });
  if (entry.source === "github-release") {
    if (source.license !== entry.license) {
      return stop(`giấy phép của ${entry.repo} đổi: ${entry.license} → ${source.license}`);
    }
    if (source.tag === entry.revision || source.content === entry.content) return { id, status: "same" };
    const next = { revision: source.tag, content: source.content };
    if (entry.gate.kind === "report") {
      return { id, status: "report", reason: `có ${source.tag}, đang dùng ${entry.revision}; đổi bằng tay`, next };
    }
    return { id, status: "new", next };
  }
  const { api } = source;
  const license = api.cardData?.license ?? null;
  if (license !== entry.license) {
    return stop(`giấy phép trên model card của ${entry.repo} đổi: ${entry.license} → ${license}`);
  }
  if (entry.source === "hf-file") {
    const sibling = api.siblings.find((s) => s.rfilename === entry.path);
    if (!sibling) return stop(`${entry.repo} không còn file ${entry.path}`);
    const content = contentId(sibling);
    if (content === entry.content) return { id, status: "same" };
    return { id, status: "new", next: { revision: api.sha, content, size: sibling.size ?? sibling.lfs?.size ?? null } };
  }
  if (entry.source === "hf-convert") {
    const inputs = convertInputs(api.siblings);
    if (sameMap(inputs, entry.inputs)) return { id, status: "same" };
    return { id, status: "new", next: { revision: api.sha, inputs } };
  }
  return stop(`nguồn lạ ${entry.source}`);
}

/** Revision ngắn để in: commit 40 ký tự thành 7 ký tự đầu; tag giữ nguyên. */
export const shortRev = (revision) => (/^[0-9a-f]{40}$/.test(revision) ? revision.slice(0, 7) : revision);

const STATUS = {
  same: "không có bản mới",
  new: "CÓ BẢN MỚI",
  report: "có bản mới (chỉ báo)",
  stop: "DỪNG",
};

/** Bảng Markdown "đang phát hành / mới nhất ở nguồn". */
export function checkTable(results, upstream) {
  const rows = results.map((r) => {
    const entry = upstream.entries[r.id];
    const now = shortRev(entry.revision);
    const latest = r.next ? shortRev(r.next.revision) : now;
    return `| ${r.id} | ${entry.repo} | ${now} | ${latest} | ${STATUS[r.status]}${r.reason ? `: ${r.reason}` : ""} |`;
  });
  return ["| id | Nguồn | Đang phát hành | Mới nhất ở nguồn | Kết luận |", "|---|---|---|---|---|", ...rows].join("\n");
}

/**
 * Lỗi của upstream.json so với models.config.json và phần thân manifest đang phát hành `body`: thiếu trường, `id` lạ, cổng
 * kiểm thiếu mốc, dòng `history` cuối không phải revision đang dùng, `content` SHA-256 khác file đang phát hành.
 */
export function checkUpstream(upstream, config, body) {
  const problems = [];
  const configIds = new Set(config.files.map((f) => f.id));
  const published = new Map(body.files.map((f) => [f.id, f]));
  for (const [id, e] of Object.entries(upstream.entries ?? {})) {
    const need = (...keys) => {
      for (const k of keys) if (e[k] === undefined) problems.push(`${id}: thiếu ${k}`);
    };
    if (!configIds.has(id)) problems.push(`${id}: không có trong models.config.json`);
    if (!["hf-file", "hf-convert", "github-release"].includes(e.source)) problems.push(`${id}: nguồn lạ ${e.source}`);
    need("repo", "revision", "license", "version_prefix", "r2_dir", "gate", "history");
    if (e.source === "hf-convert") need("inputs", "convert");
    else need("path", "content");
    const kind = e.gate?.kind;
    if (!["mt", "asr", "none", "report"].includes(kind)) problems.push(`${id}: gate.kind lạ ${kind}`);
    if ((kind === "mt" || kind === "asr") && !e.gate.baseline) problems.push(`${id}: thiếu gate.baseline`);
    if (kind === "mt" && !e.gate.prompt) problems.push(`${id}: thiếu gate.prompt`);
    if (e.notice !== undefined && !configIds.has(e.notice)) problems.push(`${id}: notice ${e.notice} không có trong models.config.json`);
    if (e.history?.at(-1)?.revision !== e.revision) problems.push(`${id}: dòng history cuối không phải revision đang dùng`);
    const file = published.get(id);
    if (!file) problems.push(`${id}: manifest số ${body.sequence} không có mục này`);
    else if (e.content?.startsWith("sha256:") && e.content !== `sha256:${file.sha256}`) {
      problems.push(`${id}: content khác sha256 của file đang phát hành`);
    }
  }
  return problems;
}

/** Phần thân trong phong bì đã ký trùng từng byte với dạng gọn của file phần thân (CI ký `JSON.stringify` dạng gọn). */
export function sameSignedBody(envelope, bodyText) {
  return Buffer.from(envelope.body, "base64url").toString("utf8") === JSON.stringify(JSON.parse(bodyText));
}
```

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: mọi test pass.

- [ ] **Step 5: Commit**

```bash
cd $W && git add scripts/models/update-lib.mjs scripts/models/update.test.mjs && git commit -m "feat(models): so bản model ở nguồn với upstream.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Phần gọi ra ngoài: `checkSources`, `checkLiveManifest`

**Files:**
- Create: `scripts/models/update-io.mjs`
- Modify: `scripts/models/update.test.mjs`

- [ ] **Step 1: Viết test**

Trong `update.test.mjs`: xóa hai dòng `void signBody;` và `void testKey;` ở cuối file; thêm import:

```js
import { checkLiveManifest, checkSources, fetchFile } from "./update-io.mjs";
```

Thêm cuối file:

```js
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
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: FAIL, `Cannot find module …/update-io.mjs`.

- [ ] **Step 3: Viết `update-io.mjs`**

```js
// Phần gọi ra ngoài của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md):
// chạy lệnh, đọc URL bằng curl, băm file, hỏi người vận hành. Các bước khác chỉ dùng đối tượng `io` (createIo), nên test
// thay được bằng bản giả ghi lại lệnh đã gọi.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { createInterface } from "node:readline";
import { REPO, verifyEnvelope } from "./lib.mjs";
import { MANIFEST_URL, detect, latestBody, sameSignedBody } from "./update-lib.mjs";

export const HF_API = (repo) => `https://huggingface.co/api/models/${repo}/revision/main?blobs=true`;
export const HF_RESOLVE = (repo, revision, path) => `https://huggingface.co/${repo}/resolve/${revision}/${path}`;
export const GH_API = (path) => `https://api.github.com/repos/${path}`;
export const GH_RAW = (repo, tag, path) => `https://raw.githubusercontent.com/${repo}/${tag}/${path}`;

/**
 * Chạy một lệnh, trả stdout. `inherit`: in thẳng ra màn hình (lệnh lâu), trả chuỗi rỗng. `ok`: các mã thoát coi là thành
 * công (mặc định chỉ 0). Mã khác thì ném lỗi kèm stderr.
 */
export function exec(cmd, args, { cwd = REPO, env, inherit = false, ok = [0] } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: inherit ? "inherit" : "pipe",
  });
  if (r.error) throw new Error(`không chạy được ${cmd}: ${r.error.message}`);
  if (!ok.includes(r.status)) {
    const detail = inherit ? "" : `\n${(r.stderr || r.stdout || "").trim()}`;
    throw new Error(`${cmd} ${args.join(" ")} thoát mã ${r.status}${detail}`);
  }
  return inherit ? "" : r.stdout;
}

/** SHA-256 của một file, đọc theo luồng (file model vài GB). */
export function sha256File(path) {
  return new Promise((ok, fail) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => ok(hash.digest("hex")))
      .on("error", fail);
  });
}

/** Các thao tác ra ngoài dựng trên `run` (mặc định `exec`). */
export function createIo(run = exec) {
  const curl = (url) => run("curl", ["-fsSL", "--retry", "2", url]);
  return {
    run,
    succeeds(cmd, args) {
      try {
        run(cmd, args);
        return true;
      } catch {
        return false;
      }
    },
    text: curl,
    json: (url) => JSON.parse(curl(url)),
    /** Tải `url` về `dest`, tải tiếp được nếu còn phần dở. */
    download(url, dest) {
      run("curl", ["-fL", "--retry", "3", "-C", "-", "--create-dirs", "-o", dest, url], { inherit: true });
      return dest;
    },
    sleep: (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
  };
}

/** Tải `url` về `dest` qua `dest.part` (chỉ đổi tên khi tải xong); `dest` đã có thì không tải lại. */
export function fetchFile(io, url, dest) {
  if (existsSync(dest)) return dest;
  const part = `${dest}.part`;
  try {
    io.download(url, part);
  } catch {
    // Phần dở có thể đã đủ (máy chủ trả 416 cho lần tải tiếp): tải lại từ đầu một lần.
    rmSync(part, { force: true });
    io.download(url, part);
  }
  renameSync(part, dest);
  return dest;
}

/** So mọi mục của upstream.json với nguồn; mỗi repo Hugging Face chỉ đọc một lần. `work`: thư mục làm việc. */
export async function checkSources(io, upstream, work) {
  const hf = new Map();
  const results = [];
  for (const [id, entry] of Object.entries(upstream.entries)) {
    if (entry.source === "github-release") {
      const tag = io.json(GH_API(`${entry.repo}/releases/latest`)).tag_name;
      const license = io.json(GH_API(entry.repo)).license?.spdx_id ?? null;
      let content = null;
      if (tag !== entry.revision) {
        const file = fetchFile(io, GH_RAW(entry.repo, tag, entry.path), join(work, "check", id, tag, basename(entry.path)));
        content = `sha256:${await sha256File(file)}`;
      }
      results.push(detect(id, entry, { tag, license, content }));
    } else {
      if (!hf.has(entry.repo)) hf.set(entry.repo, io.json(HF_API(entry.repo)));
      results.push(detect(id, entry, { api: hf.get(entry.repo) }));
    }
  }
  return results;
}

/**
 * Manifest đang chạy trên R2 phải có chữ ký hợp lệ bằng `keys` và phần thân trùng body-N.json mới nhất của repo (spec
 * mục 3.1 bước 1). Trả `{ sequence, path }` của body đó.
 */
export async function checkLiveManifest(io, releasedDir, keys) {
  const latest = latestBody(releasedDir);
  const envelope = JSON.parse(io.text(`${MANIFEST_URL}?t=${Date.now()}`));
  const live = await verifyEnvelope(envelope, keys);
  if (!sameSignedBody(envelope, readFileSync(latest.path, "utf8"))) {
    throw new Error(
      `Manifest đang chạy (số ${live.sequence}) khác ${relative(REPO, latest.path)}: repo và R2 đang lệch nhau, cần người xem trước khi chạy tiếp.`,
    );
  }
  return latest;
}

/** Hỏi người vận hành một câu; không phải terminal, Ctrl+C hay đóng đầu vào thì trả chuỗi rỗng (coi là "không"). */
export function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve("");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) => {
    rl.on("SIGINT", () => rl.close());
    rl.on("close", () => done(""));
    rl.question(question, (answer) => {
      done(answer);
      rl.close();
    });
  });
}
```

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && node --test scripts/models/update.test.mjs`
Expected: mọi test pass.

- [ ] **Step 5: Commit**

```bash
cd $W && git add scripts/models/update-io.mjs scripts/models/update.test.mjs && git commit -m "feat(models): đọc nguồn model và kiểm manifest đang chạy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lệnh `pnpm models:update --check`

**Files:**
- Create: `scripts/models/update.mjs`
- Modify: `package.json` (khối `scripts`)
- Modify: `.github/workflows/ci.yml:52-53`

- [ ] **Step 1: Viết `update.mjs`**

```js
#!/usr/bin/env node
// `pnpm models:update`: kiểm bản mới của các model ở nguồn, chuẩn bị, chạy cổng kiểm, hỏi rồi đăng lên hệ thống (spec
// docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md; runbook docs/release/phat-hanh.md mục 13).
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { builtInKeys, REPO } from "./lib.mjs";
import { checkTable, checkUpstream, parseArgs } from "./update-lib.mjs";
import { checkLiveManifest, checkSources, createIo } from "./update-io.mjs";

const PATHS = {
  upstream: resolve(REPO, "scripts/models/upstream.json"),
  config: resolve(REPO, "scripts/models/models.config.json"),
  released: resolve(REPO, "scripts/models/released"),
  work: resolve(REPO, "target/models-update"),
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Kiểm manifest đang chạy và upstream.json, rồi so với nguồn; in bảng. Trả `{ latest, upstream, results }`. */
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

async function main(argv) {
  const args = parseArgs(argv);
  const io = createIo();
  if (args.mode === "check") {
    const { results } = await check(io);
    return results.some((r) => r.status === "stop") ? 1 : 0;
  }
  throw new Error(`Chế độ ${args.mode} chưa có (kế hoạch 02, 03 của cap-nhat-model).`);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Lỗi: ${e.message}`);
    process.exit(2);
  },
);
```

Mã thoát: 0 xong (kể cả có bản mới hay bản chỉ báo); 1 có mục phải dừng; 2 lỗi.

- [ ] **Step 2: Thêm script vào `package.json`**

Trong khối `"scripts"`, thêm sau dòng `"tauri": "tauri"` (nhớ thêm dấu phẩy vào dòng trước):

```json
    "models:update": "node scripts/models/update.mjs"
```

- [ ] **Step 3: Thêm test vào CI**

Trong `.github/workflows/ci.yml`, bước "Script phát hành và script manifest model (node --test)", đổi dòng `run:` thành:

```yaml
        run: node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs
```

- [ ] **Step 4: Chạy thật (đọc mạng, không ghi gì)**

Run: `cd $W && pnpm models:update --check; echo "mã thoát $?"`
Expected:
- Dòng "Manifest đang chạy là số 3, khớp scripts/models/released/body-3.json."
- Bảng 8 dòng, cột Kết luận đều "không có bản mới" (2026-10-23 chưa có bản mới ở nguồn).
- `mã thoát 0`.

Nếu một dòng báo "DỪNG" vì giấy phép (ví dụ API trả `MIT` thay vì `mit`), đối chiếu giá trị thật bằng `curl -s 'https://huggingface.co/api/models/<repo>/revision/main?blobs=true' | python3 -c 'import json,sys; print(json.load(sys.stdin)["cardData"]["license"])'`, sửa `license` trong `upstream.json` cho đúng, chạy lại test của Task 2 rồi chạy lại bước này.

Nếu lỗi `lệch nhau` hay lỗi mạng tới `releases.aitranslator.vn`: kiểm `dig @8.8.8.8 releases.aitranslator.vn`; dừng và báo chủ dự án, không sửa code để vượt qua.

- [ ] **Step 5: Chạy toàn bộ test script**

Run: `cd $W && node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs`
Expected: mọi test pass.

- [ ] **Step 6: Commit**

```bash
cd $W && git add scripts/models/update.mjs package.json .github/workflows/ci.yml && git commit -m "feat(models): pnpm models:update --check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
