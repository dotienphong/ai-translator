#!/usr/bin/env node
// Kiểm script cài của website (install.ps1, install.sh) có bắt kịp bản stable không. Lý do: `pnpm deploy` ghim thẳng số phiên bản stable
// và SHA-256 vào hai script (website/src/build/pin-installers.mjs, chủ ý để R2 hay CI bị chiếm cũng không đổi được file cài), nên
// mỗi lần phát hành xong mà quên `pnpm deploy` thì `irm https://aitranslator.vn/install.ps1 | iex` vẫn cài bản cũ, và nếu file bản cũ
// không còn trên R2 thì lỗi "could not download" (2026-11-03: ghim 0.5.2, stable 0.6.2, 0.5.2 đã không còn trên R2).
//
//   node scripts/release/check-site-pin.mjs [--grace-minutes 120]
//
// Lỗi (exit 1) khi: bản ghim khác stable quá `--grace-minutes` kể từ `pub_date` của stable (cho người vận hành thời gian deploy), hay
// file cài của bản ghim (.exe, .dmg) không tải được từ R2, hay script chưa ghim gì. Không cần secret: chỉ đọc trang công khai.
// Chạy theo lịch ở .github/workflows/site-pin-check.yml: run đỏ thì GitHub gửi email cho chủ repo.

import { pathToFileURL } from "node:url";

export const SITE = "https://aitranslator.vn";
export const RELEASES = "https://releases.aitranslator.vn";
const PRODUCT = "AI Translator";

/** Số phiên bản ghim trong script; `null` khi chưa ghim (hai dòng để trống) hay không đọc được. */
export function pinOf(text, kind) {
  const re = kind === "ps1" ? /^\s*\$PinVersion\s*=\s*'([^']*)'\s*$/m : /^PIN_VERSION="([^"]*)"\s*$/m;
  const v = re.exec(text)?.[1] ?? "";
  return /^\d+\.\d+\.\d+$/.test(v) ? v : null;
}

/** URL file cài của một phiên bản, đúng cách hai script dựng (khoảng trắng thành %20). */
export function installerUrl(version, kind) {
  const name = kind === "ps1" ? `${PRODUCT}_${version}_x64-setup.exe` : `${PRODUCT}_${version}_aarch64.dmg`;
  return `${RELEASES}/${version}/${name.replaceAll(" ", "%20")}`;
}

/** Danh sách lỗi (rỗng là ổn). `get(url, method)` trả `{ status, text }`; `now` là mili giây. */
export async function problems({ get, now = Date.now(), graceMinutes = 120 }) {
  const out = [];
  const latest = await get(`${RELEASES}/stable/latest.json`, "GET");
  if (latest.status !== 200) return [`không đọc được stable/latest.json (HTTP ${latest.status})`];
  const { version: stable, pub_date: pub } = JSON.parse(latest.text);
  const ageMin = Number.isFinite(Date.parse(pub)) ? (now - Date.parse(pub)) / 60000 : Infinity;
  for (const [file, kind, label] of [["install.ps1", "ps1", "Windows"], ["install.sh", "sh", "macOS"]]) {
    const page = await get(`${SITE}/${file}`, "GET");
    if (page.status !== 200) {
      out.push(`${file}: không đọc được (HTTP ${page.status})`);
      continue;
    }
    const pin = pinOf(page.text, kind);
    if (pin === null) {
      out.push(`${file}: chưa ghim phiên bản (deploy ở chế độ thử?); chạy \`pnpm deploy\` trong website/`);
      continue;
    }
    const file200 = await get(installerUrl(pin, kind), "HEAD");
    if (file200.status !== 200) {
      out.push(`${file} (${label}): bản ghim ${pin} không tải được (HTTP ${file200.status}) ${installerUrl(pin, kind)}`);
    }
    if (pin !== stable && ageMin > graceMinutes) {
      out.push(`${file} (${label}): ghim ${pin} nhưng stable là ${stable} (đăng ${Math.round(ageMin)} phút trước): chạy \`pnpm deploy\` trong website/`);
    }
  }
  return out;
}

async function http(url, method) {
  const res = await fetch(url, { method, cache: "no-store", headers: { "user-agent": "ai-translator-site-pin-check" } });
  return { status: res.status, text: method === "GET" ? await res.text() : "" };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const i = process.argv.indexOf("--grace-minutes");
  const graceMinutes = i > 0 ? Number(process.argv[i + 1]) : 120;
  const list = await problems({ get: http, graceMinutes });
  if (list.length === 0) console.log("script cài của website khớp bản stable và tải được file cài");
  else {
    for (const p of list) console.error(`LỖI: ${p}`);
    process.exit(1);
  }
}
