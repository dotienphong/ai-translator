// Lấy chữ thật cho video (spec 2026-10-21-demo-video §2.3):
// - `latency-bench session --streaming`: engine, tiến trình phụ và luật cắt/ghép câu của app (gói Chuẩn, cài đặt mặc định, bật
//   dịch trong lúc nói), chạy trên giọng đọc của voice.mjs;
// - `latency-bench mt-eval` biến thể `plain`: hàm dịch mà Gõ dịch dùng (`pipeline::translate`, không ngữ cảnh), cho câu trả lời.
// Ghi scripts/demo-video/data/live.<ngôn ngữ>.json và compose.<…>.json (commit). Không sửa tay hai file này (spec §4).
//   cargo build --release -p latency-bench && scripts/copy-sidecars.sh    # khi code engine hay sidecar đổi
//   node scripts/demo-video/data.mjs [vi]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Sự kiện engine gửi giao diện mà video dùng; `indicators` giữ để kiểm chế độ dịch trong lúc nói còn bật.
const KEEP = new Set(["subtitle", "delta", "live", "live_end", "indicators"]);
// latency-bench cảnh báo khi phát lại chậm hơn thời gian thực quá mức này (`FEED_LAG_WARN_MS` của session.rs).
const FEED_LAG_LIMIT_MS = 100;

/** Phần của báo cáo `latency-bench session` mà video cần. */
export function slimLive(report) {
  const { session_ms, feed_lag_max_ms, sidecar_restarts } = report.run;
  return {
    args: report.args,
    machine: report.machine,
    run: { session_ms, feed_lag_max_ms, sidecar_restarts },
    summary: report.summary,
    events: report.events.filter((e) => KEEP.has(e.kind)),
  };
}

/** Lý do không dùng được lượt chạy (rỗng là dùng được). */
export function liveProblems(live) {
  const problems = [];
  if (live.run.feed_lag_max_ms > FEED_LAG_LIMIT_MS) {
    problems.push(`phát lại chậm hơn thời gian thực ${live.run.feed_lag_max_ms} ms (máy đang bận?): chạy lại`);
  }
  if (live.run.sidecar_restarts > 0) problems.push(`tiến trình phụ khởi động lại ${live.run.sidecar_restarts} lần`);
  if (!live.events.some((e) => e.kind === "live")) problems.push("không có dòng đang nói nào: chế độ dịch trong lúc nói không chạy");
  if (live.events.some((e) => e.kind === "indicators" && e.streamingUnavailable)) {
    problems.push("engine tự tắt dịch trong lúc nói (máy chưa đủ nhanh)");
  }
  const finals = live.events.filter((e) => e.kind === "subtitle" && !e.provisional);
  if (finals.some((e) => e.status === "failed")) problems.push("có câu dịch lỗi");
  if (!finals.some((e) => e.status === "done")) problems.push("không có câu nào dịch xong");
  return problems;
}

/** Dòng kết quả của mt-eval → dữ liệu Gõ dịch của video, kèm điều kiện chạy. */
export function composeFrom(row, meta, src) {
  if (row.status !== "done") throw new Error(`mt-eval không dịch được câu trả lời: ${row.reason ?? row.status}`);
  return {
    src,
    hyp: row.hyp,
    total_ms: row.total_ms,
    first_token_ms: row.first_token_ms,
    attempts: row.attempts,
    model_file: meta.model_file,
    git_head: meta.git_head,
    git_dirty: meta.git_dirty,
  };
}

function main(lang) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../..");
  const out = path.join(root, "target/demo-video");
  const bin = path.join(root, "src-tauri/binaries");
  const paths = {
    bench: path.join(root, "target/release/latency-bench"),
    asrWorker: path.join(bin, "asr-worker-aarch64-apple-darwin"),
    llamaServer: path.join(bin, "llama-server-aarch64-apple-darwin"),
    asrModel: path.join(root, "models/ggml-large-v3-turbo-q5_0.bin"),
    mtModel: path.join(root, "models/Hy-MT2-1.8B-Q8_0.gguf"),
    wav: path.join(out, `voice16.${lang}.wav`),
    truth: path.join(out, `truth.${lang}.json`),
  };
  const missing = Object.values(paths).filter((p) => !existsSync(p));
  if (missing.length > 0) {
    console.error(`Thiếu: ${missing.join(", ")} (chưa chạy voice.mjs, chưa build latency-bench hay chưa chép sidecar)`);
    process.exit(1);
  }
  const script = JSON.parse(readFileSync(path.join(here, `script.${lang}.json`), "utf8"));
  mkdirSync(path.join(here, "data"), { recursive: true });

  // Dịch live: mọi tiếng nguồn và ngưỡng im lặng 50 ms như cài đặt mặc định của app; bật dịch trong lúc nói.
  const sessionOut = path.join(out, `session.${lang}.json`);
  execFileSync(
    paths.bench,
    [
      "session",
      "--wav", paths.wav,
      "--truth", paths.truth,
      "--asr-worker", paths.asrWorker,
      "--asr-model", paths.asrModel,
      "--llama-server", paths.llamaServer,
      "--mt-model", paths.mtModel,
      "--languages", "en,zh,ja,ko,vi",
      "--target", script.target,
      "--end-silence-ms", "50",
      "--streaming",
      "--out", sessionOut,
    ],
    { cwd: root, stdio: "inherit" },
  );
  const live = slimLive(JSON.parse(readFileSync(sessionOut, "utf8")));
  const problems = liveProblems(live);
  if (problems.length > 0) {
    console.error(`Không dùng được lượt chạy này:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  writeFileSync(path.join(here, "data", `live.${lang}.json`), `${JSON.stringify(live, null, 1)}\n`);
  for (const e of live.events) {
    if (e.kind === "subtitle" && e.status === "done" && !e.provisional) console.log(`  ${e.src_text}\n  → ${e.tgt_text}`);
  }

  // Gõ dịch: câu trả lời qua đúng hàm dịch của ô soạn.
  const mtDir = path.join(out, `mt.${lang}`);
  rmSync(mtDir, { recursive: true, force: true });
  mkdirSync(mtDir, { recursive: true });
  const testset = path.join(mtDir, "testset.jsonl");
  const { reply, replyLang, replyTarget } = script.chat;
  const item = { id: "reply", dir: `${replyLang}-${replyTarget}`, src_lang: replyLang, tgt_lang: replyTarget, src: reply };
  writeFileSync(testset, `${JSON.stringify(item)}\n`);
  execFileSync(
    paths.bench,
    ["mt-eval", "--testset", testset, "--llama-server", paths.llamaServer, "--model", paths.mtModel, "--out-dir", mtDir, "--variant", "plain"],
    { cwd: root, stdio: "inherit" },
  );
  const stem = path.basename(paths.mtModel, ".gguf");
  const row = JSON.parse(readFileSync(path.join(mtDir, `${stem}-plain.jsonl`), "utf8").trim());
  const meta = JSON.parse(readFileSync(path.join(mtDir, `${stem}-plain.meta.json`), "utf8"));
  const compose = composeFrom(row, meta, reply);
  writeFileSync(path.join(here, "data", `compose.${lang}.json`), `${JSON.stringify(compose, null, 1)}\n`);
  console.log(`  ${compose.src}\n  → ${compose.hyp} (${compose.total_ms} ms)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2] ?? "vi");
