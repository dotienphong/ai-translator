// Luồng của `pnpm recipes:update` (spec 2026-10-26-phan-biet-nguoi-noi §7.1; kế hoạch 06): kiểm công thức, chạy bộ test cây giao diện ghi sẵn, hỏi
// rồi đăng (đẩy main, ký trong CI, đăng lên R2, kiểm lại qua URL công khai), quay lại bản trước. Mọi thứ bên ngoài (lệnh, mạng, câu hỏi,
// đường dẫn, khóa) đến qua `ctx = { io, paths, ask, keys }`, nên test chạy được bằng đồ giả; cùng kiểu với scripts/models/update-flow.mjs.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isYes, BUCKET } from "../models/update-lib.mjs";
import { GH_REPO, ghEnv, textWithHint } from "../models/update-publish.mjs";
import {
  R2_KEY,
  RECIPES_URL,
  RELEASED_DIR,
  SOURCE,
  allowedPath,
  bodyInfo,
  canonical,
  commitMessage,
  describeDiff,
  latestReleased,
  revertBody,
  strangers,
} from "./update-lib.mjs";
import { verifyRecipes } from "./lib.mjs";

const fresh = (url) => `${url}?t=${Date.now()}`;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const git = (io, args) => io.run("git", args).trim();

/** Phần thân đang phát hành (đọc từ URL công khai, kiểm chữ ký bằng `keys`); `null` nếu chưa đăng lần nào (404). */
export async function liveBody(io, keys) {
  let text;
  try {
    text = textWithHint(io, fresh(RECIPES_URL));
  } catch (e) {
    if (e.status === 22) return null; // curl -f: HTTP 4xx (chưa có file)
    throw e;
  }
  const envelope = JSON.parse(text);
  const body = await verifyRecipes(envelope, keys);
  return { text: body, envelope };
}

/** Điều kiện trước khi đăng: nhánh, cây làm việc (chỉ file của lượt này), công cụ. Trả commit `HEAD` lúc kiểm. */
function preflight({ io }, version) {
  const branch = git(io, ["branch", "--show-current"]);
  if (branch !== "main") throw new Error(`Phải chạy ở nhánh main (đang ở ${branch || "HEAD rời"}).`);
  const others = strangers(io.run("git", ["status", "--porcelain", "-z", "--untracked-files=all"]), allowedPath(version));
  if (others.length) throw new Error(`Cây làm việc có file ngoài công thức (${others.slice(0, 5).join(", ")}): commit hay cất chúng trước.`);
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  const head = git(io, ["rev-parse", "HEAD"]);
  if (head !== git(io, ["rev-parse", "origin/main"])) throw new Error("main ở máy khác origin/main: pull hay push trước.");
  ghEnv(io);
  io.run("pnpm", ["--dir", "server", "exec", "wrangler", "whoami", "--json"]);
  io.run("curl", ["--version"]);
  io.run("cargo", ["--version"]);
  return head;
}

/** Cổng kiểm: luật của app (`check_recipes_body`) rồi bộ test cây giao diện ghi sẵn của worker. */
function gate({ io, paths }, bodyPath, previousPath) {
  const env = { RECIPES_BODY: join(paths.repo, bodyPath), ...(previousPath ? { RECIPES_PREVIOUS: join(paths.repo, previousPath) } : {}) };
  io.run("cargo", ["test", "--locked", "-p", "speaker-ops", "--lib", "check_recipes_body", "--", "--ignored", "--nocapture"], { inherit: true, env });
  io.run("cargo", ["test", "--locked", "-p", "speaker-worker", "--lib"], { inherit: true });
}

/** Kích sign-recipes.yml, đợi, tải recipes.json đã ký về; trả đường dẫn. Mã lượt chạy nhận ra bằng `headSha` đúng `origin/main`. */
function signInCi(io, { bodyRel, previousRel, work }) {
  const env = ghEnv(io);
  const gh = (args, opts = {}) => io.run("gh", [...args, "--repo", GH_REPO], { env, ...opts });
  const listRuns = (fields) => JSON.parse(gh(["run", "list", "--workflow", "sign-recipes.yml", "--limit", "20", "--json", fields]));
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  const origin = git(io, ["rev-parse", "origin/main"]);
  const known = new Set(listRuns("databaseId").map((r) => r.databaseId));
  const inputs = ["-f", `body=${bodyRel}`, ...(previousRel ? ["-f", `previous=${previousRel}`] : ["-f", "first_release=true"])];
  gh(["workflow", "run", "sign-recipes.yml", "--ref", "main", ...inputs]);
  let run;
  for (let i = 0; i < 24 && !run; i++) {
    io.sleep(5000);
    run = listRuns("databaseId,headSha").find((r) => !known.has(r.databaseId) && r.headSha === origin)?.databaseId;
  }
  if (!run) throw new Error("Không tìm thấy lượt chạy sign-recipes.yml vừa kích: xem tab Actions.");
  console.log(`Đợi CI ký công thức (lượt ${run})…`);
  gh(["run", "watch", String(run), "--exit-status", "--interval", "15"], { inherit: true });
  const dir = join(work, "signed", String(run));
  rmSync(dir, { recursive: true, force: true });
  gh(["run", "download", String(run), "-n", "speaker-recipes", "-D", dir]);
  return join(dir, "recipes.json");
}

/** Đăng recipes.json đã ký lên R2 (sao lưu bản đang chạy trước), rồi kiểm lại qua URL công khai. */
function publish(io, signedPath, { work, previousVersion }) {
  const signed = readFileSync(signedPath, "utf8");
  const live = (() => {
    try {
      return textWithHint(io, fresh(RECIPES_URL));
    } catch (e) {
      if (e.status === 22) return null;
      throw e;
    }
  })();
  if (live === signed) return "recipes.json này đã được đăng từ trước";
  if (live !== null) {
    const liveVersion = JSON.parse(Buffer.from(JSON.parse(live).body, "base64url").toString("utf8")).version;
    if (liveVersion !== previousVersion) throw new Error(`Bản đang phát hành là số ${liveVersion}, không phải số ${previousVersion}: không đăng.`);
    const backup = join(work, "backup", `recipes-v${liveVersion}.json`);
    mkdirSync(dirname(backup), { recursive: true });
    writeFileSync(backup, live);
  }
  const put = ["--dir", "server", "exec", "wrangler", "r2", "object", "put", `${BUCKET}/${R2_KEY}`, "--file", signedPath, "--content-type", "application/json", "--cache-control", "no-cache", "--remote"];
  io.run("pnpm", put, { inherit: true });
  if (textWithHint(io, fresh(RECIPES_URL)) !== signed) throw new Error(`Đã đăng nhưng ${RECIPES_URL} chưa trả đúng bản đã ký. Đăng lại: pnpm ${put.join(" ")}`);
  return live === null ? "đã đăng recipes.json (lần đầu)" : `đã đăng recipes.json (bản cũ lưu ở ${join(work, "backup")})`;
}

/** Kiểm nguồn và in khác biệt; trả thông tin cho bước đăng. */
async function prepare(ctx, { revertTo } = {}) {
  const { io, paths, keys } = ctx;
  const live = await liveBody(io, keys);
  const liveInfo = live ? bodyInfo(live.text) : null;
  const released = existsSync(paths.released) ? latestReleased(paths.released) : null;
  let sourceText = readFileSync(join(paths.repo, SOURCE), "utf8");
  if (revertTo !== undefined) {
    const target = join(paths.released, `body-${revertTo}.json`);
    if (!existsSync(target)) throw new Error(`Không có ${RELEASED_DIR}/body-${revertTo}.json.`);
    if (!liveInfo) throw new Error("Chưa có công thức nào đang phát hành: không có gì để quay lại.");
    if (revertTo >= liveInfo.version) throw new Error(`--revert-to ${revertTo}: bản đang phát hành là số ${liveInfo.version}, phải chọn số nhỏ hơn.`);
    sourceText = revertBody(readFileSync(target, "utf8"), liveInfo.version);
  }
  const info = bodyInfo(sourceText);
  if (liveInfo && info.version <= liveInfo.version) {
    throw new Error(`"version" là ${info.version} nhưng bản đang phát hành là số ${liveInfo.version}: tăng "version" (app không nhận số cũ hơn).`);
  }
  if (liveInfo && released && released.version !== liveInfo.version) {
    throw new Error(`${RELEASED_DIR} có bản mới nhất là số ${released.version} nhưng đang phát hành số ${liveInfo.version}: kiểm lại (lượt đăng dở?).`);
  }
  console.log(`Công thức đang phát hành: ${liveInfo ? `số ${liveInfo.version}` : "chưa có"}.\n`);
  console.log(describeDiff(live ? JSON.parse(live.text) : null, info.body).join("\n"));
  return { live, liveInfo, info, sourceText, released };
}

/** Chạy một chế độ của lệnh (`args` từ `parseArgs`); trả mã thoát (0 hay 1), lỗi thì ném. */
export async function run(args, ctx) {
  const { io, paths } = ctx;
  if (args.mode === "check") {
    const p = await prepare(ctx);
    gate(ctx, SOURCE, p.liveInfo ? `${RELEASED_DIR}/body-${p.liveInfo.version}.json` : null);
    return 0;
  }
  // `prepare` trước `preflight`: phải biết số phiên bản mới thì mới biết file nào của repo được phép đổi (`allowedPath`).
  const p = await prepare(ctx, { revertTo: args.mode === "revert" ? args.version : undefined });
  const version = p.info.version;
  const preflightHead = preflight(ctx, version);
  const bodyRel = SOURCE;
  const previousRel = p.liveInfo ? `${RELEASED_DIR}/body-${p.liveInfo.version}.json` : null;
  if (args.mode === "revert") writeFileSync(join(paths.repo, SOURCE), p.sourceText);
  gate(ctx, bodyRel, previousRel);
  const question = args.mode === "revert" ? `Đăng lại nội dung số ${args.version} thành công thức số ${version}? [y/N] ` : `Đăng công thức số ${version} cho người dùng? [y/N] `;
  console.log("\nGõ y: commit và đẩy main, ký công thức trong CI, đăng recipes.json lên R2. App của người dùng nhận trong vòng 6 giờ, áp dụng từ phiên dịch sau.");
  if (!isYes(await ctx.ask(question))) {
    if (args.mode === "revert") io.run("git", ["checkout", "--", SOURCE]);
    console.log("Không đăng.");
    return 0;
  }
  if (git(io, ["rev-parse", "HEAD"]) !== preflightHead) throw new Error("main đã đổi trong lúc kiểm: chạy lại từ đầu.");
  const releasedRel = `${RELEASED_DIR}/body-${version}.json`;
  mkdirSync(join(paths.repo, RELEASED_DIR), { recursive: true });
  writeFileSync(join(paths.repo, releasedRel), `${canonical(p.sourceText)}\n`);
  const add = [SOURCE, releasedRel];
  io.run("git", ["add", "--", ...add, "scripts/speaker-recipes/fixtures"]);
  // Chạy lại sau khi đã commit (lượt trước dừng giữa chừng): không còn gì để commit thì bỏ qua, đẩy vẫn là lệnh an toàn.
  if (io.run("git", ["diff", "--cached", "--name-only"]).trim()) {
    io.run("git", ["commit", "-m", commitMessage(version), "--", ...add, "scripts/speaker-recipes/fixtures"]);
  }
  io.run("git", ["push", "origin", "HEAD:main"], { inherit: true });
  const signed = signInCi(io, { bodyRel, previousRel, work: paths.work });
  const envelope = readJson(signed);
  if ((await verifyRecipes(envelope, ctx.keys)) !== canonical(p.sourceText)) throw new Error("Bản đã ký không khớp công thức trong repo: KHÔNG đăng, cần người xem.");
  console.log(publish(io, signed, { work: paths.work, previousVersion: p.liveInfo?.version ?? null }));
  console.log(`\nXong: công thức số ${version} đã đăng.`);
  return 0;
}
