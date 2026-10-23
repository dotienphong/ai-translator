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
const DNS_HINT = "lỗi mạng hay DNS: thử dig @8.8.8.8 releases.aitranslator.io.vn";

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

/** File ở `url` có SHA-256 `sha256` không: `true`, `false` (khác nội dung) hay `null` (chưa có). Tải về `scratch` để băm. */
export async function publicMatches(io, url, sha256, scratch) {
  const code = io.run("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", fresh(url)]).trim();
  if (code === "404") return null;
  if (code !== "200") throw new Error(`${url} trả HTTP ${code} (${DNS_HINT}).`);
  rmSync(scratch, { force: true });
  io.download(fresh(url), scratch);
  const same = (await sha256File(scratch)) === sha256;
  rmSync(scratch, { force: true });
  return same;
}

/** Tải một file lên R2, không bao giờ ghi đè (spec mục 5.1), rồi kiểm lại qua tên miền công khai. */
export async function uploadR2(io, { key, path, sha256 }, scratch) {
  const url = PUBLIC_BASE + key.replace(/^models\//, "");
  const before = await publicMatches(io, url, sha256, scratch);
  if (before === true) return "đã có";
  if (before === false) throw new Error(`${key} đã có trên R2 với nội dung khác: không ghi đè, cần người xem.`);
  io.run("rclone", ["copyto", path, `r2:${BUCKET}/${key}`, "--s3-no-check-bucket"], { inherit: true });
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

/** Commit các file của kế hoạch và đẩy `main`; trả commit có phần thân mới. Đã đẩy hay đã commit từ lần trước thì không làm lại. */
export function commitAndPush(io, plan) {
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  if (io.succeeds("git", ["cat-file", "-e", `origin/main:${plan.bodyRel}`])) {
    return io.run("git", ["log", "-1", "--format=%H", "origin/main", "--", plan.bodyRel]).trim();
  }
  if (!io.succeeds("git", ["cat-file", "-e", `HEAD:${plan.bodyRel}`])) {
    io.run("git", ["add", "--", ...Object.keys(plan.files), ...plan.bench.map((b) => b.to)]);
    io.run("git", ["commit", "-m", plan.message]);
  }
  io.run("git", ["push", "origin", "HEAD:main"], { inherit: true });
  return io.run("git", ["rev-parse", "HEAD"]).trim();
}

/** Commit và đẩy kế hoạch chỉ ghi nhận revision (`kind: "record"`, spec mục 4.3): không ký, không đăng manifest. */
export function commitRecord(io, plan) {
  io.run("git", ["add", "--", ...Object.keys(plan.files)]);
  io.run("git", ["commit", "-m", plan.message]);
  io.run("git", ["push", "origin", "HEAD:main"], { inherit: true });
}

/**
 * Ký phần thân trong CI (sign-manifest.yml), trả đường dẫn models.json đã ký. Mã lượt chạy ghi vào `plan.run` rồi `save`
 * ngay, để lần chạy lại đợi đúng lượt đó; lượt đó đã hỏng hay bị hủy thì kích lượt mới.
 */
export function signInCi(io, plan, commit, { save, work }) {
  const env = ghEnv(io);
  const gh = (args, opts = {}) => io.run("gh", [...args, "--repo", GH_REPO], { env, ...opts });
  if (plan.run) {
    const { status, conclusion } = JSON.parse(gh(["run", "view", String(plan.run), "--json", "status,conclusion"]));
    if (status === "completed" && conclusion !== "success") plan.run = undefined;
  }
  if (!plan.run) {
    const started = Date.now();
    gh(["workflow", "run", "sign-manifest.yml", "--ref", "main", "-f", `body=${plan.bodyRel}`, "-f", `previous=${plan.prevRel}`]);
    for (let i = 0; i < 24 && !plan.run; i++) {
      io.sleep(5000);
      const runs = JSON.parse(
        gh(["run", "list", "--workflow", "sign-manifest.yml", "--event", "workflow_dispatch", "--limit", "10", "--json", "databaseId,headSha,createdAt"]),
      );
      plan.run = runs.find((r) => r.headSha === commit && Date.parse(r.createdAt) >= started - 60_000)?.databaseId;
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

/** Đăng models.json đã ký (sao lưu bản đang chạy trước), rồi kiểm lại qua URL công khai. */
export function publishManifest(io, signedPath, work) {
  const signed = readFileSync(signedPath, "utf8");
  const live = io.text(fresh(MANIFEST_URL));
  if (live === signed) return "models.json này đã được đăng từ trước";
  const sequence = JSON.parse(Buffer.from(JSON.parse(live).body, "base64url").toString("utf8")).sequence;
  const backup = join(work, "backup", `models-seq-${sequence}.json`);
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, live);
  const put = ["--dir", "server", "exec", "wrangler", "r2", "object", "put", `${BUCKET}/models/models.json`, "--file", signedPath, "--content-type", "application/json", "--cache-control", "no-cache", "--remote"];
  io.run("pnpm", put, { inherit: true });
  if (io.text(fresh(MANIFEST_URL)) !== signed) {
    throw new Error(`Đã đăng nhưng ${MANIFEST_URL} chưa trả đúng bản đã ký (${DNS_HINT}). Đăng lại: pnpm ${put.join(" ")}`);
  }
  return `đã đăng models.json (bản cũ lưu ở ${backup})`;
}

/** Thực hiện kế hoạch đăng từ đầu hay từ bước dở. `save(plan)` ghi lại state.json khi kế hoạch có thêm thông tin. */
export async function publish(io, plan, { save, work, repo = REPO }) {
  writeFiles(plan, repo);
  for (const u of plan.uploads) console.log(`${u.key}: ${await uploadR2(io, u, join(work, "scratch"))}`);
  checkManifestBody(io, plan, repo);
  const commit = commitAndPush(io, plan);
  const signed = signInCi(io, plan, commit, { save, work });
  await verifySigned(signed, plan.files[plan.bodyRel]);
  console.log(publishManifest(io, signed, work));
}
