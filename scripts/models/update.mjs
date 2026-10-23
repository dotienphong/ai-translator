#!/usr/bin/env node
// `pnpm models:update`: kiểm bản mới của các model ở nguồn, chuẩn bị, chạy cổng kiểm, hỏi rồi đăng lên hệ thống (spec
// docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md; runbook docs/release/phat-hanh.md mục 13).
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { builtInKeys, REPO } from "./lib.mjs";
import { checkTable, checkUpstream, gateTable, latestBody, parseArgs } from "./update-lib.mjs";
import { checkLiveManifest, checkSources, createIo, fetchPublished } from "./update-io.mjs";
import { buildTools, runGate } from "./update-gate.mjs";

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

async function main(argv) {
  const args = parseArgs(argv);
  const io = createIo();
  if (args.mode === "check") {
    const { results } = await check(io);
    return results.some((r) => r.status === "stop") ? 1 : 0;
  }
  if (args.mode === "gate-only") return gateOnly(io, args.id);
  throw new Error(`Chế độ ${args.mode} chưa có (kế hoạch 03 của cap-nhat-model).`);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Lỗi: ${e.message}`);
    process.exit(2);
  },
);
