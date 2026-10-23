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
