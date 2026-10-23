// Luồng của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md; runbook
// docs/release/phat-hanh.md mục 13): kiểm nguồn, chuẩn bị, cổng kiểm, hỏi rồi đăng, quay lại, làm tiếp lượt dở. Mọi thứ
// bên ngoài (lệnh, mạng, câu hỏi, đường dẫn, khóa) đến qua `ctx = { io, paths, ask, keys }`, nên test chạy được bằng đồ giả.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { sha256hex } from "./lib.mjs";
import { basename, join, relative, resolve } from "node:path";
import {
  buildRollbackPlan,
  buildUpdatePlan,
  checkTable,
  checkUpstream,
  gateTable,
  isYes,
  latestBody,
  noticeIds,
  planTable,
  rejectedHit,
  publishedAtNow,
  PUBLIC_BASE,
  rollbackChanges,
  sameSignedBody,
  serializeJson,
  shortRev,
  MANIFEST_URL,
} from "./update-lib.mjs";
import { checkLiveManifest, checkSources, fetchPublished } from "./update-io.mjs";
import { buildTools, checkGateInputs, runGate } from "./update-gate.mjs";
import { prepare } from "./update-prepare.mjs";
import { GH_REPO, commitRecord, ghEnv, publicMatches, publish, recordHead } from "./update-publish.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const stateFile = (ctx) => join(ctx.paths.state, "state.json");
const loadState = (ctx) => (existsSync(stateFile(ctx)) ? readJson(stateFile(ctx)) : null);
/** Ghi nguyên tử (file tạm rồi đổi tên): bị ngắt giữa chừng thì state.json cũ vẫn đọc được. */
function saveState(ctx, plan) {
  mkdirSync(ctx.paths.state, { recursive: true });
  const tmp = `${stateFile(ctx)}.tmp`;
  writeFileSync(tmp, serializeJson(plan));
  renameSync(tmp, stateFile(ctx));
}
const clearState = (ctx) => rmSync(stateFile(ctx), { force: true });

/** Kiểm manifest đang chạy và upstream.json, rồi so với nguồn; in bảng. */
async function check(ctx) {
  const { io, paths } = ctx;
  const latest = await checkLiveManifest(io, paths.released, ctx.keys);
  const upstream = readJson(paths.upstream);
  const problems = checkUpstream(upstream, readJson(paths.config), readJson(latest.path));
  if (problems.length) throw new Error(`upstream.json không khớp:\n- ${problems.join("\n- ")}`);
  console.log(`Manifest đang chạy là số ${latest.sequence}, khớp ${relative(paths.repo, latest.path)}.\n`);
  const results = await checkSources(io, upstream, paths.work);
  console.log(checkTable(results, upstream));
  return { latest, upstream, results };
}

/** Điều kiện trước khi đăng hay quay lại (spec mục 3.1 bước 1). Trả commit `HEAD` lúc kiểm, để so lại khi gõ y. */
function preflight({ io }) {
  const branch = io.run("git", ["branch", "--show-current"]).trim();
  if (branch !== "main") throw new Error(`Phải chạy ở nhánh main (đang ở ${branch || "HEAD rời"}).`);
  if (io.run("git", ["status", "--porcelain"]).trim()) throw new Error("Cây làm việc chưa sạch: commit hay cất các thay đổi trước.");
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  const head = io.run("git", ["rev-parse", "HEAD"]).trim();
  if (head !== io.run("git", ["rev-parse", "origin/main"]).trim()) {
    throw new Error("main ở máy khác origin/main: pull hay push trước.");
  }
  if (!io.run("rclone", ["listremotes"]).split("\n").includes("r2:")) {
    throw new Error("rclone chưa có remote r2: (runbook docs/release/phat-hanh.md mục 13).");
  }
  ghEnv(io);
  io.run("pnpm", ["--dir", "server", "exec", "wrangler", "whoami", "--json"]); // `--json` mới thoát khác 0 khi chưa đăng nhập
  io.run("curl", ["--version"]);
  io.run("uv", ["--version"]);
  io.run("cargo", ["--version"]);
  return head;
}

/**
 * Lúc gõ y: `main` phải còn đúng commit đã kiểm ở `preflight` (kế hoạch được dựng trên repo lúc đó, mà cổng kiểm có thể
 * chạy cả giờ). Trả commit để ghi vào `plan.head`.
 */
function holdHead(io, preflightHead) {
  const head = recordHead(io);
  if (head !== preflightHead) {
    throw new Error(`main đã đổi trong lúc chuẩn bị (${preflightHead.slice(0, 7)} → ${head.slice(0, 7)}): chạy lại từ đầu.`);
  }
  return head;
}

/** Đẩy main hủy lượt CI đang chạy trên main (cancel-in-progress): báo trước câu hỏi y/N. */
function warnCi({ io }) {
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
async function confirmAndPublish(ctx, plan, question, preflightHead) {
  const { io, paths } = ctx;
  warnCi(ctx);
  console.log(
    "\nGõ y: tải file lên R2 (nếu có), commit và đẩy main, ký manifest trong CI, đăng models.json. App của người dùng nhận trong vòng một ngày.",
  );
  if (!isYes(await ctx.ask(question))) {
    console.log("Không đăng.");
    return 0;
  }
  plan.head = holdHead(io, preflightHead); // từ đây main phải đứng yên tới khi đẩy xong (repoStage)
  saveState(ctx, plan);
  await publish(io, plan, { save: (p) => saveState(ctx, p), work: paths.work, state: paths.state, repo: paths.repo, keys: ctx.keys });
  clearState(ctx);
  console.log(`\nXong: manifest số ${plan.target} đã đăng.`);
  return 0;
}

/** Làm tiếp lượt đăng dở trong state.json. */
async function resume(ctx, plan) {
  const { io, paths } = ctx;
  const envelope = JSON.parse(io.text(`${MANIFEST_URL}?t=${Date.now()}`));
  const live = JSON.parse(Buffer.from(envelope.body, "base64url").toString("utf8")).sequence;
  if (live === plan.target && sameSignedBody(envelope, plan.files[plan.bodyRel])) {
    clearState(ctx);
    console.log(`Lượt đăng manifest số ${plan.target} đã xong từ trước.`);
    return 0;
  }
  if (live !== plan.base) {
    throw new Error(`${stateFile(ctx)} là lượt đăng số ${plan.target} trên số ${plan.base}, nhưng manifest đang chạy là số ${live}: xem lại, rồi xóa file đó nếu bỏ lượt này.`);
  }
  console.log(`Có lượt đăng dở: ${plan.message}.`);
  if (!isYes(await ctx.ask("Làm tiếp lượt đăng dở? [y/N] "))) {
    console.log(`Không làm tiếp. Muốn bỏ hẳn lượt này thì xóa ${stateFile(ctx)} và hoàn tác các file đã ghi trong repo.`);
    return 0;
  }
  await publish(io, plan, { save: (p) => saveState(ctx, p), work: paths.work, state: paths.state, repo: paths.repo, keys: ctx.keys });
  clearState(ctx);
  console.log(`\nXong: manifest số ${plan.target} đã đăng.`);
  return 0;
}

async function update(ctx) {
  const { io, paths } = ctx;
  const pending = loadState(ctx);
  if (pending) return resume(ctx, pending);
  const preflightHead = preflight(ctx);
  const { latest, upstream, results } = await check(ctx);
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
    const local = await prepare(io, paths.work, r.id, entry, r.next, was.file);
    const hit = rejectedHit(entry, local.sha256);
    if (hit) {
      console.log(`Bỏ qua: bản chuyển ra trùng bản đã bị quay lại ở manifest số ${hit.sequence}.`);
      continue;
    }
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
      const outDir = join(paths.work, r.id, r.next.revision, "gate");
      item.gate = runGate(io, entry, local.path, label, outDir);
      // Môi trường chuyển (bản các gói Python) đi cùng kết quả đo vào repo, để biết bản phát hành được chuyển thế nào.
      const convertEnv = join(paths.work, r.id, r.next.revision, "convert-env.txt");
      if (existsSync(convertEnv)) copyFileSync(convertEnv, join(outDir, "convert-env.txt"));
      item.bench = { from: outDir, to: `bench/model-updates/${date}-${r.id}-${shortRev(r.next.revision)}` };
      item.baseline = `${item.bench.to}/${basename(item.gate.result)}`;
      console.log(gateTable(item.gate, entry.gate.kind));
    } else {
      console.log("Khác biệt so với bản đang phát hành:");
      io.run("diff", ["-u", await fetchPublished(io, paths.work, was), local.path], { inherit: true, ok: [0, 1] });
    }
    prepared.push(item);
  }
  if (prepared.length === 0) {
    console.log("\nKhông còn gì để đăng.");
    return 0;
  }
  const failed = prepared.filter((p) => p.gate && !p.gate.pass).map((p) => p.id);
  if (failed.length) {
    console.log(`\nKhông đạt cổng kiểm: ${failed.join(", ")}. Không đăng gì.`);
    return 1;
  }
  const noticeTexts = Object.fromEntries(
    noticeIds(upstream).map((id) => [id, readFileSync(resolve(paths.repo, "scripts/models", body.files.find((f) => f.id === id).file), "utf8")]),
  );
  const plan = buildUpdatePlan({
    body,
    upstream,
    configText: readFileSync(paths.config, "utf8"),
    noticeTexts,
    prepared,
    publishedAt: publishedAtNow(),
    repo: paths.repo,
  });
  if (plan.kind === "record") {
    console.log(`\n${plan.message}`);
    if (!isYes(await ctx.ask("Ghi nhận revision mới vào upstream.json (không đăng gì cho người dùng)? [y/N] "))) {
      console.log("Không ghi nhận.");
      return 0;
    }
    holdHead(io, preflightHead);
    commitRecord(io, plan, paths.repo);
    console.log("Đã ghi nhận và đẩy main.");
    return 0;
  }
  console.log(`\n${planTable(plan, body)}`);
  return confirmAndPublish(ctx, plan, "Đăng bản model mới cho người dùng? [y/N] ", preflightHead);
}

async function rollback(ctx, sequence) {
  const { io, paths } = ctx;
  if (loadState(ctx)) throw new Error(`Còn lượt đăng dở (${stateFile(ctx)}): chạy pnpm models:update để làm tiếp, hay xóa file đó.`);
  const preflightHead = preflight(ctx);
  const latest = await checkLiveManifest(io, paths.released, ctx.keys);
  if (sequence >= latest.sequence) throw new Error(`--rollback-to ${sequence}: manifest đang chạy là số ${latest.sequence}, phải chọn số nhỏ hơn.`);
  const targetPath = join(paths.released, `body-${sequence}.json`);
  if (!existsSync(targetPath)) throw new Error(`Không có ${relative(paths.repo, targetPath)}.`);
  const current = readJson(latest.path);
  const target = readJson(targetPath);
  const upstream = readJson(paths.upstream);
  const problems = checkUpstream(upstream, readJson(paths.config), current);
  if (problems.length) throw new Error(`upstream.json không khớp:\n- ${problems.join("\n- ")}`);
  const notices = new Set(noticeIds(upstream));
  const noticeTexts = {};
  for (const [id, f] of Object.entries(rollbackChanges(current, target))) {
    const url = PUBLIC_BASE + f.url;
    const same = await publicMatches(io, url, f.sha256, join(paths.work, "scratch"));
    if (same !== true) throw new Error(`${f.url} ${same === null ? "không còn" : "khác SHA-256"} trên R2: không quay lại được.`);
    if (notices.has(id)) {
      // Tải lại bản NOTICE (qua tham số chống cache) để ghi vào repo; phải đúng SHA-256 của manifest.
      const text = io.text(`${url}?t=${Date.now()}`);
      if (sha256hex(Buffer.from(text)) !== f.sha256) throw new Error(`${f.url} tải về không khớp SHA-256 của manifest số ${target.sequence}: không quay lại được.`);
      noticeTexts[id] = text;
    }
  }
  const plan = buildRollbackPlan({
    current,
    target,
    upstream,
    configText: readFileSync(paths.config, "utf8"),
    noticeTexts,
    publishedAt: publishedAtNow(),
  });
  if (!plan) {
    console.log(`Các model đang chạy đã giống manifest số ${sequence}: không có gì để quay lại.`);
    return 0;
  }
  console.log(`\n${planTable(plan, current)}`);
  return confirmAndPublish(ctx, plan, `Quay các model về như manifest số ${sequence}? [y/N] `, preflightHead);
}

/** Cổng kiểm với file đang phát hành của `id` (hiệu chỉnh: phải đạt). Kết quả giữ trong target/, không commit. */
async function gateOnly(ctx, id) {
  const { io, paths } = ctx;
  const entry = readJson(paths.upstream).entries[id];
  if (!entry) throw new Error(`upstream.json không có ${id}.`);
  if (entry.gate.kind !== "mt" && entry.gate.kind !== "asr") {
    throw new Error(`${id} không có cổng kiểm (gate.kind là ${entry.gate.kind}).`);
  }
  const latest = latestBody(paths.released);
  const file = readJson(latest.path).files.find((f) => f.id === id);
  if (!file) throw new Error(`manifest số ${latest.sequence} không có ${id}.`);
  checkGateInputs(); // trước khi tải model vài GB
  const model = await fetchPublished(io, paths.work, file);
  buildTools(io);
  const label = `gate-only-${id}-${file.sha256.slice(0, 12)}`;
  const gate = runGate(io, entry, model, label, join(paths.work, "gate-only", label));
  console.log(`\n${id}: file đang phát hành so với mốc ${entry.gate.baseline}\n\n${gateTable(gate, entry.gate.kind)}`);
  return gate.pass ? 0 : 1;
}

/**
 * Chạy một chế độ của lệnh (`args` từ `parseArgs`); trả mã thoát (0 hay 1), lỗi thì ném.
 * `ctx`: `io` (createIo), `paths` (upstream, config, released, work, state, repo), `ask` (hỏi người vận hành), `keys`
 * (khóa công khai tin cậy).
 */
export async function run(args, ctx) {
  if (args.mode === "check") {
    if (loadState(ctx)) console.log(`Có lượt đăng dở (${stateFile(ctx)}): chạy pnpm models:update để làm tiếp.\n`);
    const { results } = await check(ctx);
    return results.some((r) => r.status === "stop") ? 1 : 0;
  }
  if (args.mode === "gate-only") return gateOnly(ctx, args.id);
  if (args.mode === "rollback") return rollback(ctx, args.sequence);
  return update(ctx);
}
