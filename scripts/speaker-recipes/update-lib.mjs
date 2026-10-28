// Logic của `pnpm recipes:update` (spec 2026-10-26-phan-biet-nguoi-noi §7.1; kế hoạch 06): đọc tham số, kiểm phần thân, so với bản đang phát
// hành, dựng bảng in ra, quyết định những đường dẫn mà một lượt đăng được phép đụng trong repo. Không gọi mạng, không chạy lệnh
// ngoài (phần đó ở update-flow.mjs).
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** URL công thức đang phát hành; trùng `RECIPES_URL` của `src-tauri/src/speaker/recipes.rs` (có test). */
export const RECIPES_URL = "https://releases.aitranslator.vn/speaker/recipes.json";
/** Khóa trong bucket R2 (cùng bucket với models.json, `BUCKET` của scripts/models/update-lib.mjs). */
export const R2_KEY = "speaker/recipes.json";
/** Nguồn: cũng là bản build sẵn nhúng vào app (`speaker_recipe::BUILTIN_JSON`). */
export const SOURCE = "scripts/speaker-recipes/recipes.json";
/** Lưu phần thân đã phát hành (`body-<version>.json`), để quay lại và để so ở lượt sau. */
export const RELEASED_DIR = "scripts/speaker-recipes/released";
export const FIXTURES_DIR = "scripts/speaker-recipes/fixtures";

export const USAGE = `Dùng:
  pnpm recipes:update                  kiểm scripts/speaker-recipes/recipes.json (đã sửa, tăng "version"), chạy bộ test, hỏi y/N rồi đăng
  pnpm recipes:update --check          chỉ kiểm và in khác biệt so với bản đang phát hành, không đăng
  pnpm recipes:update --revert-to <V>  đăng lại nội dung của phiên bản V (số mới = số đang phát hành + 1)`;

export function parseArgs(argv) {
  if (argv.length === 0) return { mode: "update" };
  const [flag, value, ...rest] = argv;
  if (flag === "--check" && value === undefined) return { mode: "check" };
  if (flag === "--revert-to" && value && rest.length === 0) {
    if (!/^[1-9]\d*$/.test(value)) throw new Error(`--revert-to cần số phiên bản nguyên dương, không phải ${value}.`);
    return { mode: "revert", version: Number(value) };
  }
  throw new Error(`Tham số không hợp lệ: ${argv.join(" ")}\n${USAGE}`);
}

/** Đọc và kiểm hình dạng một phần thân; ném lỗi nếu không phải công thức schema 1 có `version` nguyên dương. */
export function bodyInfo(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    throw new Error(`Công thức không phải JSON: ${e.message}`);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error("Công thức phải là một đối tượng JSON.");
  if (body.schema !== 1) throw new Error(`Công thức có schema ${body.schema}, app đọc schema 1.`);
  if (!Number.isSafeInteger(body.version) || body.version < 1) throw new Error('Công thức thiếu "version" nguyên dương.');
  if (typeof body.min_app_version !== "string" || !/^\d+\.\d+\.\d+$/.test(body.min_app_version)) {
    throw new Error('Công thức thiếu "min_app_version" dạng x.y.z.');
  }
  if (!Array.isArray(body.apps)) throw new Error('Công thức thiếu mảng "apps".');
  return { body, version: body.version, minAppVersion: body.min_app_version, apps: body.apps.map((a) => `${a.app}/${a.os}`) };
}

/** Phần thân gọn đúng như `sign-recipes.mjs` ký (`JSON.stringify` của bản đã đọc). */
export const canonical = (text) => JSON.stringify(JSON.parse(text));

/** Phần thân đã phát hành có số lớn nhất trong `dir` (`body-<n>.json`); `null` nếu chưa có. */
export function latestReleased(dir) {
  const numbers = readdirSync(dir)
    .map((name) => /^body-([1-9]\d*)\.json$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  if (numbers.length === 0) return null;
  const version = Math.max(...numbers);
  return { version, path: join(dir, `body-${version}.json`) };
}

/** Các dòng mô tả khác biệt giữa hai phần thân (đã đọc): phiên bản, bản app tối thiểu, mục thêm, bỏ, đổi. */
export function describeDiff(prev, next) {
  const lines = [];
  const key = (a) => `${a.app}/${a.os}`;
  const prevApps = new Map((prev?.apps ?? []).map((a) => [key(a), JSON.stringify(a)]));
  const nextApps = new Map(next.apps.map((a) => [key(a), JSON.stringify(a)]));
  lines.push(`version: ${prev ? prev.version : "(chưa có bản nào)"} → ${next.version}`);
  if (prev && prev.min_app_version !== next.min_app_version) lines.push(`min_app_version: ${prev.min_app_version} → ${next.min_app_version}`);
  for (const k of [...nextApps.keys()].filter((k) => !prevApps.has(k))) lines.push(`+ thêm ${k}`);
  for (const k of [...prevApps.keys()].filter((k) => !nextApps.has(k))) lines.push(`- bỏ ${k}${nextApps.size === 0 ? " (công thức không còn mục nào: bộ đọc tắt từ xa)" : ""}`);
  for (const [k, v] of nextApps) if (prevApps.has(k) && prevApps.get(k) !== v) lines.push(`~ đổi ${k}`);
  if (lines.length === 1 && prev && prev.version === next.version) lines.push("(không có gì khác)");
  return lines;
}

/** Phần thân để quay lại `target`: nội dung cũ, `version` mới (= đang phát hành + 1, vì app không nhận số cũ hơn). */
export function revertBody(targetText, liveVersion) {
  const body = JSON.parse(targetText);
  body.version = liveVersion + 1;
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** Các đường dẫn mà lượt đăng phiên bản `version` được phép đụng trong repo: nguồn, bản lưu của nó, và file mới của bộ fixture. */
export const allowedPath = (version) => (path) =>
  path === SOURCE || path === `${RELEASED_DIR}/body-${version}.json` || path.startsWith(`${FIXTURES_DIR}/`);

/** Đường dẫn trong đầu ra `git status --porcelain -z` không nằm trong `allowed`. */
export function strangers(porcelainZ, allowed) {
  return porcelainZ
    .split("\0")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((path) => !allowed(path));
}

export const commitMessage = (version) => `feat(speaker): công thức đọc tên số ${version}`;
