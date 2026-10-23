// Phần gọi ra ngoài của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md):
// chạy lệnh, đọc URL bằng curl, băm file, hỏi người vận hành. Các bước khác chỉ dùng đối tượng `io` (createIo), nên test
// thay được bằng bản giả ghi lại lệnh đã gọi.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { FORMAT, REPO, VERSION, verifyEnvelope } from "./lib.mjs";
import { MANIFEST_URL, PUBLIC_BASE, detect, latestBody, sameSignedBody } from "./update-lib.mjs";

export const HF_API = (repo) => `https://huggingface.co/api/models/${repo}/revision/main?blobs=true`;
export const HF_RESOLVE = (repo, revision, path) => `https://huggingface.co/${repo}/resolve/${revision}/${path}`;
export const GH_API = (path) => `https://api.github.com/repos/${path}`;
export const GH_RAW = (repo, tag, path) => `https://raw.githubusercontent.com/${repo}/${tag}/${path}`;

/**
 * Chạy một lệnh, trả stdout. `inherit`: in thẳng ra màn hình (lệnh lâu), trả chuỗi rỗng. `ok`: các mã thoát coi là thành
 * công (mặc định chỉ 0). Mã khác thì ném lỗi kèm stderr; lỗi có `status` (mã thoát, `null` khi bị tín hiệu giết) và
 * `signal` để nơi gọi phân biệt từng loại lỗi (ví dụ mã 33 của curl).
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
    const how = r.signal ? `bị dừng bởi tín hiệu ${r.signal}` : `thoát mã ${r.status}`;
    throw Object.assign(new Error(`${cmd} ${args.join(" ")} ${how}${detail}`), { status: r.status, signal: r.signal });
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

/** Mã blob git (SHA-1 của `blob <cỡ>\0` + nội dung) của một file nhỏ, giống `git hash-object --no-filters`. */
export function gitBlobId(path) {
  const bytes = readFileSync(path);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** Các thao tác ra ngoài dựng trên `run` (mặc định `exec`). */
export function createIo(run = exec) {
  // Đọc trang nhỏ: hạn chờ nối 20 giây, tổng 120 giây.
  const curl = (url) => run("curl", ["-fsSL", "--retry", "2", "--connect-timeout", "20", "--max-time", "120", url]);
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
    json(url) {
      const body = curl(url);
      try {
        return JSON.parse(body);
      } catch (e) {
        throw Object.assign(new Error(`${url} không trả JSON hợp lệ: ${e.message}`), { invalidJson: true });
      }
    },
    /**
     * Tải `url` về `dest`, tải tiếp được nếu còn phần dở. Không đặt tổng thời gian (file vài GB); chỉ bỏ khi nối quá 20 giây
     * hay tốc độ dưới 1 KiB/giây suốt 60 giây.
     */
    download(url, dest) {
      const guard = ["--connect-timeout", "20", "--speed-limit", "1024", "--speed-time", "60"];
      run("curl", ["-fL", "--retry", "3", ...guard, "-C", "-", "--create-dirs", "-o", dest, url], { inherit: true });
      return dest;
    },
    sleep: (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
  };
}

/**
 * Tải `url` về `dest` qua `dest.part` (chỉ đổi tên khi tải xong); `dest` đã có thì không tải lại. Lỗi tải thì giữ `.part`
 * để lần chạy sau tải tiếp (`-C -`); chỉ khi curl báo máy chủ không tải tiếp được (mã 33) hay vị trí tải tiếp sai (mã 36)
 * mới xóa `.part` và tải lại từ đầu một lần. (`.part` đã đủ thì curl 8 không báo lỗi.)
 */
export function fetchFile(io, url, dest) {
  if (existsSync(dest)) return dest;
  const part = `${dest}.part`;
  try {
    io.download(url, part);
  } catch (e) {
    if (e.status !== 33 && e.status !== 36) throw e;
    rmSync(part, { force: true });
    io.download(url, part);
  }
  renameSync(part, dest);
  return dest;
}

/** Tải `url` vào `scratch`, băm, xóa file; không giữ lại gì (chỉ để biết nội dung có đổi không). Trả SHA-256 (hex). */
async function hashDownload(io, url, scratch) {
  const clean = () => {
    rmSync(scratch, { force: true });
    rmSync(`${scratch}.part`, { force: true });
  };
  clean();
  try {
    return await sha256File(fetchFile(io, url, scratch));
  } finally {
    clean();
  }
}

/** So mọi mục của upstream.json với nguồn; mỗi repo Hugging Face chỉ đọc một lần. `work`: thư mục làm việc. */
export async function checkSources(io, upstream, work) {
  const hf = new Map();
  const results = [];
  for (const [id, entry] of Object.entries(upstream.entries)) {
    try {
      if (entry.source === "github-release") {
        const tag = io.json(GH_API(`${entry.repo}/releases/latest`)).tag_name;
        const license = io.json(GH_API(entry.repo)).license?.spdx_id ?? null;
        let content = null;
        if (tag !== entry.revision) {
          const sha = await hashDownload(io, GH_RAW(entry.repo, tag, entry.path), join(work, "check", id, "scratch"));
          content = `sha256:${sha}`;
        }
        results.push(detect(id, entry, { tag, license, content }));
      } else {
        if (!hf.has(entry.repo)) hf.set(entry.repo, io.json(HF_API(entry.repo)));
        results.push(detect(id, entry, { api: hf.get(entry.repo) }));
      }
    } catch (e) {
      results.push({ id, status: "stop", reason: `không đọc được nguồn: ${e.message}` });
    }
  }
  return results;
}

/**
 * Manifest đang chạy trên R2 phải có chữ ký hợp lệ bằng `keys` và phần thân trùng body-N.json mới nhất của repo (spec
 * mục 3.1 bước 1). Phong bì phải đúng `format`/`version`; `sequence` trong body-N.json phải là N. Trả `{ sequence, path }`
 * của body đó.
 */
export async function checkLiveManifest(io, releasedDir, keys) {
  const latest = latestBody(releasedDir);
  const bodyText = readFileSync(latest.path, "utf8");
  const inner = JSON.parse(bodyText).sequence;
  if (inner !== latest.sequence) {
    throw new Error(`${relative(REPO, latest.path)} có sequence ${inner}, không khớp số ${latest.sequence} trong tên file.`);
  }
  let envelope;
  try {
    envelope = io.json(`${MANIFEST_URL}?t=${Date.now()}`);
  } catch (e) {
    // Nội dung không phải JSON thì lỗi đã nêu URL; chỉ lỗi tải mới gợi ý kiểm mạng, DNS.
    if (e.invalidJson) throw e;
    throw new Error(`${e.message} (lỗi mạng hay DNS: thử dig @8.8.8.8 releases.aitranslator.io.vn)`);
  }
  if (envelope.format !== FORMAT) throw new Error(`Manifest đang chạy có format ${envelope.format}, cần ${FORMAT}.`);
  if (envelope.version !== VERSION) throw new Error(`Manifest đang chạy có version ${envelope.version}, cần ${VERSION}.`);
  const live = await verifyEnvelope(envelope, keys);
  if (!sameSignedBody(envelope, bodyText)) {
    throw new Error(
      `Manifest đang chạy (số ${live.sequence}) khác ${relative(REPO, latest.path)}: repo và R2 đang lệch nhau, cần người xem trước khi chạy tiếp.`,
    );
  }
  return latest;
}

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

/**
 * Hỏi người vận hành một câu; không phải terminal hay đóng đầu vào thì trả chuỗi rỗng (coi là "không"). Ctrl+C chỉ trả
 * chuỗi rỗng khi cả stdin và stdout là terminal; khi stdout bị dẫn đi (ví dụ `| tee`) thì Ctrl+C giết tiến trình (mã 130),
 * vẫn an toàn vì chưa đăng gì trước khi có câu trả lời.
 */
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
