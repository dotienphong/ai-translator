// Cổng kiểm của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md mục 4.4):
// chạy model bằng đúng engine của app (llama-server b11146 của tools/, asr-worker build từ workspace), chấm A3 (dịch) hay
// A4 (nhận dạng), so với mốc của model đang phát hành.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
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

/** Features của `asr-worker` trong bản phát hành Mac; trùng `scripts/copy-sidecars.sh` (có test). */
export const ASR_FEATURES = "metal,shared-encode";

/** Môi trường chấm, như bench/2026-10-21-goi-nhanh/README.md (COMET) và bench/phase0/asr/score_asr.py (WER/CER). */
const COMET = ["unbabel-comet==2.2.7", "transformers==4.57.6", "torch==2.14.1", "setuptools<81", "sacrebleu==2.6.0"];
const JIWER = ["jiwer==4.0.0", "opencc==1.4.2"];
const uvPython = (deps, args) => ["run", "--no-project", "--python", "3.12", ...deps.flatMap((d) => ["--with", d]), "python", ...args];

/** Dữ liệu thử và llama-server phải có trước khi tải hay build gì (chúng chỉ có ở thư mục chính, bị .gitignore). */
export function checkGateInputs(paths = GATE_PATHS) {
  for (const p of [paths.llamaServer, paths.mtTestset, join(paths.asrData, "manifest.jsonl")]) {
    if (!existsSync(p)) throw new Error(`Thiếu ${p} (dữ liệu thử và llama-server: xem bench/phase0/README.md).`);
  }
}

/** Build công cụ đo; `asr-worker` có cùng features với bản phát hành trên Mac (scripts/copy-sidecars.sh). */
export function buildTools(io, paths = GATE_PATHS) {
  checkGateInputs(paths);
  io.run("cargo", ["build", "--release", "--locked", "-p", "latency-bench"], { inherit: true });
  io.run("cargo", ["build", "--release", "--locked", "-p", "asr-worker", "--features", ASR_FEATURES], { inherit: true });
}

/**
 * Chạy cổng kiểm của `entry` với file `model`. `label`: nhãn của lượt (tên kết quả chấm); `outDir`: nơi giữ kết quả chấm
 * và `gate.md`. Trả `{ pass, rows, problems, result }`; `result` là JSON kết quả, dùng làm mốc lần sau.
 */
export function runGate(io, entry, model, label, outDir, paths = GATE_PATHS) {
  mkdirSync(outDir, { recursive: true });
  const kind = entry.gate.kind;
  if (kind !== "mt" && kind !== "asr") throw new Error(`gate.kind lạ ${kind}`);
  const gate = kind === "mt" ? mtGate(io, entry, model, label, outDir, paths) : asrGate(io, entry, model, label, outDir, paths);
  writeFileSync(join(outDir, "gate.md"), `${gateTable(gate, kind)}\n`);
  return gate;
}

function engineFailed(engine, log, error) {
  return new Error(
    `Model không chạy được bằng ${engine} của app (thường do model cần llama.cpp/whisper.cpp mới hơn bản đóng trong app; không đăng). Xem log ${log}. Lỗi: ${error.message}`,
  );
}

/**
 * `latency-bench mt-eval` ghi `<out-dir>/<tên model>-plain.meta.json` (git_head, git_dirty, ...) và từ chối dịch tiếp vào
 * thư mục có meta khác. Kết quả dịch cũ làm bằng code khác bản hiện tại (HEAD khác, hay trạng thái sửa dở khác), bằng
 * llama-server khác hay model có dung lượng khác thì xóa để dịch lại từ đầu; cùng điều kiện thì giữ, để dịch tiếp lượt dở.
 */
function dropStaleOutputs(io, outputs, stem, paths, model) {
  const metaPath = join(outputs, `${stem}-plain.meta.json`);
  if (!existsSync(metaPath)) return;
  let old = {};
  try {
    old = JSON.parse(readFileSync(metaPath, "utf8"));
  } catch {
    // meta hỏng: coi như khác, xóa.
  }
  // Như `git_state` của mt_eval.rs: HEAD và `status --porcelain --untracked-files=no`.
  const head = io.run("git", ["rev-parse", "HEAD"], { cwd: paths.repo }).trim();
  const dirty = io.run("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: paths.repo }).trim() !== "";
  // Như `meta_diff` của mt_eval.rs: llama-server (đường dẫn) và model_bytes cũng phải trùng, không thì nó từ chối dịch tiếp.
  const same =
    old.git_head === head && old.git_dirty === dirty && old.llama_server === paths.llamaServer && old.model_bytes === statSync(model).size;
  if (same) return;
  console.log("Kết quả dịch cũ khác điều kiện chạy hiện tại (code, llama-server hay model): dịch lại từ đầu.");
  rmSync(outputs, { recursive: true, force: true });
}

function mtGate(io, entry, model, label, outDir, paths) {
  const evaluate = (out, extra = []) =>
    io.run(
      paths.latencyBench,
      ["mt-eval", "--testset", paths.mtTestset, "--llama-server", paths.llamaServer, "--model", model, "--prompt", entry.gate.prompt, "--out-dir", out, ...extra],
      { inherit: true },
    );
  // Chạy thử luôn bắt đầu từ thư mục trống, để thật sự khởi động engine (không dịch tiếp kết quả cũ).
  const smoke = join(outDir, "chay-thu");
  rmSync(smoke, { recursive: true, force: true });
  const stem = basename(model).replace(/\.gguf$/, "");
  try {
    evaluate(smoke, ["--limit", "2"]);
  } catch (e) {
    throw engineFailed("llama-server", join(smoke, `${stem}.llama.log`), e);
  }
  const outputs = join(paths.mtOutputs, `outputs-${label}`);
  dropStaleOutputs(io, outputs, stem, paths, model);
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
  // Chạy thử luôn bắt đầu từ trống (kết quả và log của lượt chạy thử trước).
  const smokeOut = join(outDir, "chay-thu.jsonl");
  const smokeLog = join(paths.asrData, "logs", "chay-thu.log");
  rmSync(smokeOut, { force: true });
  rmSync(smokeLog, { force: true });
  try {
    evaluate(smoke, smokeOut);
  } catch (e) {
    throw engineFailed("asr-worker", smokeLog, e);
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
