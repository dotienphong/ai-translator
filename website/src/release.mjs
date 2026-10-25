// Phiên bản và ngày phát hành của website (spec 2026-10-13-website-version-tu-dong-design.md). Không gõ tay: chế độ xem
// trước (pnpm build, dev, test) lấy từ src-tauri/tauri.conf.json; chế độ deploy (cờ --deploy của pnpm deploy) lấy từ bản đã
// đăng trên R2, vì website chỉ được nói điều có thật.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const RELEASES_URL = "https://releases.aitranslator.vn";

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const REPO_ROOT = new URL("../../", import.meta.url).pathname;

/** Ngày `YYYY-MM-DD` theo giờ Việt Nam của một thời điểm ISO (UTC+7); null khi không phải thời điểm ISO. */
export function vnDate(iso) {
  if (typeof iso !== "string" || !ISO_INSTANT.test(iso)) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** So hai phiên bản X.Y.Z hay X.Y.Z-beta.N: -1, 0 hay 1 (bản beta nhỏ hơn bản stable cùng số). Sai dạng thì ném lỗi. */
export function compareVersions(a, b) {
  const parse = (text) => {
    const m = VERSION.exec(text);
    if (!m) throw new Error(`${JSON.stringify(text)} không phải phiên bản X.Y.Z hay X.Y.Z-beta.N`);
    return { n: [+m[1], +m[2], +m[3]], beta: m[4] === undefined ? null : +m[4] };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1;
  if (x.beta === y.beta) return 0;
  if (x.beta === null) return 1;
  if (y.beta === null) return -1;
  return x.beta < y.beta ? -1 : 1;
}

/** Chế độ xem trước: version của tauri.conf.json; ngày là ngày commit nâng bản (`gitDate`), thiếu thì `today`. */
export function previewRelease({ confVersion, gitDate, today }) {
  return { version: confVersion, releaseDate: gitDate ?? today };
}

/**
 * Chế độ deploy: version và ngày của bản stable đã đăng (`latest` là stable/latest.json). Dừng khi dữ liệu lạ, hay khi R2 có
 * bản mới hơn repo (máy chưa git pull: deploy lúc đó làm mất nội dung). R2 thấp hơn repo là bình thường (đã nâng bản, chưa
 * đăng): website vẫn nói bản đã phát hành thật.
 */
export function deployRelease({ confVersion, latest }) {
  const version = latest?.version;
  if (typeof version !== "string" || !STABLE.test(version)) {
    throw new Error(`stable/latest.json có version ${JSON.stringify(version)}: kênh stable chỉ nhận X.Y.Z`);
  }
  const releaseDate = vnDate(latest.pub_date);
  if (!releaseDate) throw new Error(`stable/latest.json có pub_date ${JSON.stringify(latest.pub_date)} không hợp lệ`);
  if (compareVersions(version, confVersion) > 0) {
    throw new Error(`R2 đã có bản ${version} mới hơn repo (${confVersion}): git pull rồi deploy lại`);
  }
  return { version, releaseDate };
}

/** stable/latest.json trên R2. Lỗi mạng, mã khác 200 hay JSON hỏng đều ném lỗi: không xác minh được thì không deploy. */
export async function fetchStableLatest(fetchImpl = fetch) {
  const url = `${RELEASES_URL}/stable/latest.json`;
  const refuse = "website không deploy khi chưa xác minh được bản đã phát hành";
  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new Error(`không đọc được ${url}: ${e.message}; ${refuse}`);
  }
  if (res.status !== 200) throw new Error(`${url} trả mã ${res.status}; ${refuse}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url} không phải JSON; ${refuse}`);
  }
}

/** Tên file bộ cài và file SHA256SUMS của từng nền tảng cho một phiên bản (khớp scripts/release/take-artifact.mjs và hai script cài). */
export function installerFiles(version) {
  return {
    mac: { sums: `${RELEASES_URL}/${version}/SHA256SUMS-macos.txt`, file: `AI Translator_${version}_aarch64.dmg` },
    win: { sums: `${RELEASES_URL}/${version}/SHA256SUMS-windows.txt`, file: `AI Translator_${version}_x64-setup.exe` },
  };
}

/** SHA-256 (chữ thường) của `fileName` trong nội dung SHA256SUMS (dòng `<64 hex>  <tên>`, tên có thể có dấu `*`); không có thì null. */
export function installerHash(sumsText, fileName) {
  for (const line of String(sumsText).split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (m && m[2] === fileName) return m[1].toLowerCase();
  }
  return null;
}

/**
 * SHA-256 của hai bộ cài của `version` để ghim vào script cài (website/src/build/pin-installers.mjs). Thiếu file, lỗi mạng hay
 * không có dòng của bộ cài đều ném lỗi: không có mã đúng thì không deploy, thay vì để script cài tự tải mã từ R2.
 */
export async function fetchInstallerPins(version, fetchImpl = fetch) {
  const out = { version };
  for (const [key, { sums, file }] of Object.entries(installerFiles(version))) {
    let res;
    try {
      res = await fetchImpl(sums, { signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new Error(`không đọc được ${sums}: ${e.message}; không ghim được script cài nên không deploy`);
    }
    if (res.status !== 200) throw new Error(`${sums} trả mã ${res.status}; không ghim được script cài nên không deploy`);
    const hash = installerHash(await res.text(), file);
    if (!hash) throw new Error(`${sums} không có dòng của ${file}; không ghim được script cài nên không deploy`);
    out[key] = hash;
  }
  return out;
}

/** Ngày commit gần nhất đổi dòng `"version"` của tauri.conf.json (`YYYY-MM-DD`); null khi không có git hay không phải repo. */
export function gitCommitDate({ cwd = REPO_ROOT } = {}) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "-G", '^  "version":', "--", "src-tauri/tauri.conf.json"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Version và ngày phát hành cho website. `deploy` mặc định là có cờ `--deploy` trên dòng lệnh. */
export async function resolveRelease({
  deploy = process.argv.includes("--deploy"),
  readConf = () => JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8")),
  gitDate = gitCommitDate,
  fetchLatest = () => fetchStableLatest(),
  fetchPins = (version) => fetchInstallerPins(version),
  today = () => vnDate(new Date().toISOString()),
} = {}) {
  const confVersion = readConf().version;
  if (deploy) {
    const released = deployRelease({ confVersion, latest: await fetchLatest() });
    // `pins`: SHA-256 hai bộ cài của đúng bản này, để build ghim vào script cài (chỉ chế độ deploy).
    return { ...released, pins: await fetchPins(released.version) };
  }
  return previewRelease({ confVersion, gitDate: gitDate(), today: today() });
}
