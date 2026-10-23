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
