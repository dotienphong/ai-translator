// Bước đăng của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md mục 5, 7):
// tải lên R2, ghi file trong repo, commit và đẩy main, ký trong CI, đăng models.json. Mỗi bước kiểm trạng thái thật trước
// khi làm, nên chạy lại sau khi bị ngắt thì làm tiếp từ bước dở mà không làm hai lần.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { builtInKeys, FORMAT, REPO, VERSION, verifyEnvelope } from "./lib.mjs";
import { BUCKET, MANIFEST_URL, PUBLIC_BASE, sameSignedBody } from "./update-lib.mjs";
import { sha256File } from "./update-io.mjs";

export const GH_USER = "dotienphong";
export const GH_REPO = "dotienphong/ai-translator";
export const DNS_HINT = "lỗi mạng hay DNS: thử dig @8.8.8.8 releases.aitranslator.io.vn";

/** Biến môi trường cho `gh` chạy bằng tài khoản dotienphong (GITHUB_TOKEN của máy là tài khoản khác). */
export function ghEnv(io) {
  try {
    return { GH_TOKEN: io.run("gh", ["auth", "token", "--user", GH_USER]).trim() };
  } catch {
    throw new Error(`gh chưa đăng nhập tài khoản ${GH_USER}: chạy \`gh auth login\` với tài khoản đó.`);
  }
}

/** URL kèm tham số chống cache của Cloudflare (R2 bỏ qua tham số khi tìm object). */
const fresh = (url) => `${url}?t=${Date.now()}`;

/** Mã thoát của curl khi lỗi mạng: 6 không phân giải được tên, 7 không nối được, 28 quá hạn. */
export const NETWORK_STATUS = [6, 7, 28];

/** Chạy `fn`; lỗi mạng của curl thì ném lại kèm gợi ý kiểm DNS. */
async function withDnsHint(url, fn) {
  try {
    return await fn();
  } catch (e) {
    if (NETWORK_STATUS.includes(e.status)) throw new Error(`${url}: ${e.message} (${DNS_HINT})`);
    throw e;
  }
}

/** Đọc `url` bằng `io.text`; lỗi mạng của curl thì ném lại kèm gợi ý kiểm DNS. */
export function textWithHint(io, url) {
  try {
    return io.text(url);
  } catch (e) {
    if (NETWORK_STATUS.includes(e.status)) throw new Error(`${e.message} (${DNS_HINT})`);
    throw e;
  }
}

/** File ở `url` có SHA-256 `sha256` không: `true`, `false` (khác nội dung) hay `null` (chưa có). Tải về `scratch` để băm. */
export async function publicMatches(io, url, sha256, scratch) {
  const code = await withDnsHint(url, () =>
    io.run("curl", ["-sI", "-o", "/dev/null", "-w", "%{http_code}", "--connect-timeout", "20", "--max-time", "60", fresh(url)]).trim(),
  );
  if (code === "404") return null;
  if (code !== "200") throw new Error(`${url} trả HTTP ${code} (${DNS_HINT}).`);
  rmSync(scratch, { force: true });
  await withDnsHint(url, () => io.download(fresh(url), scratch));
  const same = (await sha256File(scratch)) === sha256;
  rmSync(scratch, { force: true });
  return same;
}

/**
 * Tải một file lên R2, không bao giờ ghi đè (spec mục 5.1: kiểm trước, và rclone chạy với `--immutable`), rồi kiểm lại qua
 * tên miền công khai. File trên đĩa phải còn đúng SHA-256 của kế hoạch ngay trước khi tải lên.
 */
export async function uploadR2(io, { key, path, sha256 }, scratch) {
  const url = PUBLIC_BASE + key.replace(/^models\//, "");
  const before = await publicMatches(io, url, sha256, scratch);
  if (before === true) return "đã có";
  if (before === false) throw new Error(`${key} đã có trên R2 với nội dung khác: không ghi đè, cần người xem.`);
  if ((await sha256File(path)) !== sha256) throw new Error(`${path} không còn đúng SHA-256 của kế hoạch: không tải lên.`);
  io.run("rclone", ["copyto", path, `r2:${BUCKET}/${key}`, "--s3-no-check-bucket", "--immutable"], { inherit: true });
  if ((await publicMatches(io, url, sha256, scratch)) !== true) {
    throw new Error(`Đã tải ${key} lên nhưng tải về qua ${url} không khớp SHA-256.`);
  }
  return "đã tải lên";
}

/**
 * Ghi các file của kế hoạch vào repo và chép kết quả đo (bỏ các lượt chạy thử). Chạy lại sau khi đã commit mà
 * target/models-update/ đã bị dọn thì bỏ qua bước chép (kết quả đo đã nằm trong commit).
 */
export function writeFiles(plan, repo = REPO) {
  for (const [rel, text] of Object.entries(plan.files)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), text);
  }
  for (const b of plan.bench) {
    if (!existsSync(b.from)) continue;
    cpSync(b.from, join(repo, b.to), { recursive: true, filter: (src) => !basename(src).startsWith("chay-thu") });
  }
}

/** Kiểm phần thân mới bằng đúng luật của app trước khi đẩy (như job `check` của sign-manifest.yml). */
export function checkManifestBody(io, plan, repo = REPO) {
  io.run("pnpm", ["build"], { inherit: true });
  io.run("cargo", ["test", "--locked", "-p", "meeting-translator", "--lib", "check_manifest_body", "--", "--ignored", "--nocapture"], {
    inherit: true,
    env: { MANIFEST_BODY: join(repo, plan.bodyRel), MANIFEST_PREVIOUS: join(repo, plan.prevRel) },
  });
}

const gitText = (io, args) => io.run("git", args).trim();

/** Commit `HEAD` hiện tại của `main` ở máy: gõ y xong thì ghi vào `plan.head`, các bước sau chỉ làm khi `main` còn nguyên. */
export function recordHead(io) {
  const branch = gitText(io, ["branch", "--show-current"]);
  if (branch !== "main") throw new Error(`Phải ở nhánh main (đang ở ${branch || "HEAD rời"}).`);
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  const head = gitText(io, ["rev-parse", "HEAD"]);
  if (head !== gitText(io, ["rev-parse", "origin/main"])) throw new Error("main ở máy khác origin/main: pull hay push trước.");
  return head;
}

/** Các đường dẫn mà lượt đăng được phép đụng trong repo: file của kế hoạch và thư mục kết quả đo. */
const planPaths = (plan) => [...Object.keys(plan.files), ...(plan.bench ?? []).map((b) => b.to)];

/** `path` (từ `git status`) có nằm trong các đường dẫn của kế hoạch không. */
const inPlan = (plan, path) => planPaths(plan).some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Repo đang ở giai đoạn nào của lượt đăng `plan` (spec mục 5, xem runbook 13.3), hay ném lỗi nếu `main` đã đổi từ lúc gõ y:
 * - "pushed": `origin/main` đã có phần thân mới;
 * - "fresh": `main` vẫn đúng `plan.head`, cây làm việc sạch hay chỉ có các file của kế hoạch;
 * - "committed": đã commit đúng lời commit của kế hoạch trên `plan.head` nhưng chưa đẩy.
 */
export function repoStage(io, plan) {
  const branch = gitText(io, ["branch", "--show-current"]);
  if (branch !== "main") throw new Error(`Phải ở nhánh main (đang ở ${branch || "HEAD rời"}).`);
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  if (io.succeeds("git", ["cat-file", "-e", `origin/main:${plan.bodyRel}`])) return "pushed";
  const head = gitText(io, ["rev-parse", "HEAD"]);
  const origin = gitText(io, ["rev-parse", "origin/main"]);
  if (plan.head && head === origin && origin === plan.head) {
    const status = io.run("git", ["status", "--porcelain", "-z", "--untracked-files=all"]);
    const strangers = status
      .split("\0")
      .filter(Boolean)
      .map((line) => line.slice(3))
      .filter((path) => !inPlan(plan, path));
    if (strangers.length) {
      throw new Error(`Cây làm việc có file ngoài kế hoạch (${strangers.slice(0, 5).join(", ")}): không đăng; xem runbook mục 13.3.`);
    }
    return "fresh";
  }
  if (plan.head && origin === plan.head) {
    let parent = null;
    try {
      parent = gitText(io, ["rev-parse", "HEAD^"]);
    } catch {
      // HEAD không có commit cha: không phải commit của kế hoạch.
    }
    if (parent === plan.head && gitText(io, ["log", "-1", "--format=%s", "HEAD"]) === plan.message) return "committed";
  }
  throw new Error(
    `main đã đổi từ lúc gõ y (HEAD ${head.slice(0, 7)}, origin/main ${origin.slice(0, 7)}, lúc gõ y ${String(plan.head).slice(0, 7)}): không đăng; xem runbook mục 13.3.`,
  );
}

/** Commit (chỉ các đường dẫn của kế hoạch) khi còn "fresh", rồi đẩy `main`; trả commit vừa đẩy. */
export function commitAndPush(io, plan, stage) {
  if (stage === "fresh") {
    const paths = planPaths(plan);
    io.run("git", ["add", "--", ...paths]);
    io.run("git", ["commit", "-m", plan.message, "--", ...paths]);
  }
  io.run("git", ["push", "origin", "HEAD:main"], { inherit: true });
  return gitText(io, ["rev-parse", "HEAD"]);
}

/**
 * Ghi, commit và đẩy kế hoạch chỉ ghi nhận revision (`kind: "record"`, spec mục 4.3): không ký, không đăng manifest. Chỉ làm
 * khi đang ở `main` và `HEAD` đúng `origin/main` (và đúng `plan.head` nếu có).
 */
export function commitRecord(io, plan, repo = REPO) {
  const head = recordHead(io);
  if (plan.head && plan.head !== head) throw new Error("main đã đổi từ lúc gõ y: không ghi nhận; chạy lại lệnh.");
  writeFiles(plan, repo);
  const paths = Object.keys(plan.files);
  io.run("git", ["add", "--", ...paths]);
  io.run("git", ["commit", "-m", plan.message, "--", ...paths]);
  io.run("git", ["push", "origin", "HEAD:main"], { inherit: true });
}

/**
 * Ký phần thân trong CI (sign-manifest.yml), trả đường dẫn models.json đã ký. Mã lượt chạy ghi vào `plan.run` rồi `save`
 * ngay, để lần chạy lại đợi đúng lượt đó; lượt đó đã hỏng hay bị hủy thì kích lượt mới. Lượt vừa kích được nhận ra bằng mã
 * mới (không có trong danh sách trước khi kích) và `headSha` đúng `origin/main`, nên lượt cũ cùng commit không bị nhầm.
 */
export function signInCi(io, plan, { save, work }) {
  const env = ghEnv(io);
  const gh = (args, opts = {}) => io.run("gh", [...args, "--repo", GH_REPO], { env, ...opts });
  const listRuns = (fields) => JSON.parse(gh(["run", "list", "--workflow", "sign-manifest.yml", "--limit", "20", "--json", fields]));
  if (plan.run) {
    const { status, conclusion } = JSON.parse(gh(["run", "view", String(plan.run), "--json", "status,conclusion"]));
    if (status === "completed" && conclusion !== "success") plan.run = undefined;
  }
  if (!plan.run) {
    io.run("git", ["fetch", "--quiet", "origin", "main"]);
    const origin = gitText(io, ["rev-parse", "origin/main"]);
    const known = new Set(listRuns("databaseId").map((r) => r.databaseId));
    gh(["workflow", "run", "sign-manifest.yml", "--ref", "main", "-f", `body=${plan.bodyRel}`, "-f", `previous=${plan.prevRel}`]);
    for (let i = 0; i < 24 && !plan.run; i++) {
      io.sleep(5000);
      plan.run = listRuns("databaseId,headSha").find((r) => !known.has(r.databaseId) && r.headSha === origin)?.databaseId;
    }
    if (!plan.run) throw new Error("Không tìm thấy lượt chạy sign-manifest.yml vừa kích: xem tab Actions rồi chạy lại lệnh.");
    save(plan);
  }
  console.log(`Đợi CI ký manifest (lượt ${plan.run})…`);
  gh(["run", "watch", String(plan.run), "--exit-status", "--interval", "15"], { inherit: true });
  const dir = join(work, "signed", String(plan.target));
  rmSync(dir, { recursive: true, force: true });
  gh(["run", "download", String(plan.run), "-n", "models-manifest", "-D", dir]);
  return join(dir, "models.json");
}

/** Bản đã ký: đúng định dạng, `kid` thuộc khối production, chữ ký hợp lệ, phần thân trùng dạng gọn của `bodyText`. */
export async function verifySigned(path, bodyText, keys = builtInKeys()) {
  const envelope = JSON.parse(readFileSync(path, "utf8"));
  if (envelope.format !== FORMAT || envelope.version !== VERSION) throw new Error("Bản đã ký sai định dạng phong bì.");
  await verifyEnvelope(envelope, keys);
  if (!sameSignedBody(envelope, bodyText)) throw new Error("Bản đã ký không khớp phần thân trong repo: KHÔNG đăng, cần người xem.");
}

/**
 * Đăng models.json đã ký (sao lưu bản đang chạy trước), rồi kiểm lại qua URL công khai. Chỉ đăng khi manifest đang chạy
 * đúng là số `plan.base` (hay chính bản này, khi đó đã xong).
 */
export function publishManifest(io, signedPath, work, plan) {
  const signed = readFileSync(signedPath, "utf8");
  const live = textWithHint(io, fresh(MANIFEST_URL));
  if (live === signed) return "models.json này đã được đăng từ trước";
  const sequence = JSON.parse(Buffer.from(JSON.parse(live).body, "base64url").toString("utf8")).sequence;
  if (sequence !== plan.base) {
    throw new Error(`manifest đang chạy là số ${sequence}, không phải số ${plan.base}: không đăng; xem runbook mục 13.3.`);
  }
  const backup = join(work, "backup", `models-seq-${sequence}.json`);
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, live);
  const put = ["--dir", "server", "exec", "wrangler", "r2", "object", "put", `${BUCKET}/models/models.json`, "--file", signedPath, "--content-type", "application/json", "--cache-control", "no-cache", "--remote"];
  io.run("pnpm", put, { inherit: true });
  if (io.text(fresh(MANIFEST_URL)) !== signed) {
    throw new Error(`Đã đăng nhưng ${MANIFEST_URL} chưa trả đúng bản đã ký (${DNS_HINT}). Đăng lại: pnpm ${put.join(" ")}`);
  }
  // URL không tham số là URL app tải; Cloudflare có thể còn giữ bản cũ trong cache một lúc (không phải lỗi, chỉ báo).
  let plain = null;
  try {
    plain = io.text(MANIFEST_URL);
  } catch {
    // báo bên dưới
  }
  if (plain !== signed) console.warn(`CHÚ Ý: URL app tải (${MANIFEST_URL}) chưa trả bản mới (cache?): kiểm lại sau ít phút.`);
  return `đã đăng models.json (bản cũ lưu ở ${backup})`;
}

/**
 * Thực hiện kế hoạch đăng từ đầu hay từ bước dở. `save(plan)` ghi lại state.json khi kế hoạch có thêm thông tin. Giai đoạn
 * của repo (`repoStage`) quyết định phần nào làm lại: "fresh" làm hết; "committed" chỉ tải lên rồi đẩy; "pushed" bỏ qua
 * mọi bước tới khi đẩy.
 * `keys`: khóa công khai tin cậy cho bản đã ký (mặc định khóa build sẵn trong app; test truyền khóa thử).
 * `work`: thư mục làm việc lớn (bản tải về, chạy thử); `state`: nơi giữ bản đã ký và bản sao lưu manifest.
 */
export async function publish(io, plan, { save, work, state = work, repo = REPO, keys }) {
  const stage = repoStage(io, plan);
  if (stage === "fresh") {
    // Chạy lại sau `cargo clean` thì file model đã chuẩn bị (trong target/) không còn: dừng trước khi ghi gì vào repo.
    const missing = [...plan.uploads.map((u) => u.path), ...plan.bench.map((b) => b.from)].filter((p) => !existsSync(p));
    if (missing.length) {
      throw new Error(`File đã chuẩn bị không còn (có thể do cargo clean): bỏ lượt này theo runbook mục 13.3 rồi chạy lại từ đầu. Thiếu: ${missing.join(", ")}`);
    }
    writeFiles(plan, repo);
    checkManifestBody(io, plan, repo);
  }
  if (stage !== "pushed") {
    for (const u of plan.uploads) console.log(`${u.key}: ${await uploadR2(io, u, join(work, "scratch"))}`);
    commitAndPush(io, plan, stage);
  }
  const signed = signInCi(io, plan, { save, work: state });
  await verifySigned(signed, plan.files[plan.bodyRel], keys);
  console.log(publishManifest(io, signed, state, plan));
}
