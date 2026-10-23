// Bước chuẩn bị của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md mục
// 4.3): tải hay tự chuyển bản mới vào target/models-update/<id>/<revision>/, kiểm nội dung khớp nguồn.
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { GH_RAW, HF_RESOLVE, fetchFile, gitBlobId, sha256File } from "./update-io.mjs";

/**
 * Kiểm file khớp định danh nội dung ở nguồn (`sha256:<hex>` hay `blob:<mã blob git>`); trả SHA-256 của file. Mã blob tự
 * tính (`gitBlobId`), không qua `git hash-object`: file nằm trong repo nên git sẽ đổi xuống dòng theo .gitattributes.
 * File không khớp bị xóa, để lần chạy lại tải lại thay vì dùng tiếp file sai.
 */
export async function verifyContent(path, content) {
  const sha = await sha256File(path);
  const got = content.startsWith("blob:") ? `blob:${gitBlobId(path)}` : `sha256:${sha}`;
  if (got !== content) {
    rmSync(path, { force: true });
    throw new Error(`${path} không khớp nguồn (${got.slice(0, 20)}…, nguồn ghi ${content.slice(0, 20)}…): đã xóa, chạy lại để tải lại.`);
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
 * Lần chạy lại sau khi đã bỏ `.lan-2` sẽ chuyển lại lần hai và so lại, nên mỗi lần chạy đều kiểm tái lập.
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
    throw new Error(
      `llama.cpp tag ${c.llama_tag} ở ${llama} là commit ${head}, upstream.json ghi ${c.llama_commit.slice(0, 7)}. Nếu vừa clone lại mà vẫn khác thì tag ở GitHub đã bị dời: sửa convert trong upstream.json sau khi kiểm.`,
    );
  }
  // Môi trường theo tag llama.cpp (requirements đổi theo tag). Dấu `.cai-xong` chỉ ghi sau khi cài xong: lần cài dở thì
  // lần chạy sau cài lại, không tin vào `bin/python` đã có.
  const venv = join(tools, `venv-${c.llama_tag}`);
  const python = join(venv, "bin", "python");
  const installed = join(venv, ".cai-xong");
  if (!existsSync(installed)) {
    if (!existsSync(python)) io.run("uv", ["venv", "-p", c.python, venv], { inherit: true });
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
    writeFileSync(installed, "");
  }
  writeFileSync(join(dir, "convert-env.txt"), io.run("uv", ["pip", "freeze", "--python", python]));
  // Thư mục nguồn mang đúng tên repo, như CONVERT.md: convert_hf_to_gguf.py lấy general.name, general.basename,
  // general.size_label từ tên thư mục, nên tên khác ("src") cho ra file khác bản đã phát hành dù trọng số y hệt.
  const src = join(dir, basename(entry.repo));
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
