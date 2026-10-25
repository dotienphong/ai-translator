// Ghim bản cài vào hai script cài (public/install.sh, public/install.ps1) lúc deploy website (kiểm toán bảo mật 2026-10-25).
//
// Vấn đề: script cài vốn lấy số phiên bản, file cài và mã SHA-256 từ cùng một nơi (releases.aitranslator.vn, R2). Ai ghi được
// vào R2 (hay lấy được token CI) thì đổi được cả file lẫn mã, và `curl | bash` cài file đó. Script nằm ở website, một nơi tin cậy
// khác (deploy bằng tay từ máy người vận hành), nên số phiên bản stable và SHA-256 của file cài được viết thẳng vào script lúc
// deploy: người chạy lệnh nhận mã do website đưa, không phải mã nằm cạnh file trên R2.
//
// Chỉ chế độ deploy (cờ `--deploy`, lấy từ R2 đúng lúc deploy) mới ghim; bản dựng thử để hai dòng trống và script theo R2 như cũ.
// Hàm ở đây thuần (không đọc mạng hay đĩa) để test được; `pinInstallers` là phần ghi file của build.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^[0-9a-f]{64}$/;

function check(version, sha256) {
  if (typeof version !== "string" || !STABLE.test(version)) throw new Error(`ghim bản cài: phiên bản ${JSON.stringify(version)} không phải X.Y.Z`);
  if (typeof sha256 !== "string" || !SHA256.test(sha256)) throw new Error(`ghim bản cài: SHA-256 ${JSON.stringify(sha256)} không phải 64 ký tự hex thường`);
}

/** Thay đúng một lần dòng `pattern` (hai nhóm: phần đầu dòng) bằng giá trị; thiếu hay lặp đều là lỗi, để script không bị bỏ ghim âm thầm. */
function setOnce(text, pattern, value, what) {
  const hits = text.match(new RegExp(pattern.source, "gm")) ?? [];
  if (hits.length !== 1) throw new Error(`ghim bản cài: ${what} xuất hiện ${hits.length} lần (cần đúng 1, và đang để trống)`);
  return text.replace(pattern, (_all, head) => `${head}${value}`);
}

/** install.sh: điền `PIN_VERSION` và `PIN_SHA256` (hai dòng `NAME=""` ở đầu file). */
export function pinInstallSh(text, version, sha256) {
  check(version, sha256);
  let out = setOnce(text, /^(PIN_VERSION=)""$/m, `"${version}"`, "PIN_VERSION");
  out = setOnce(out, /^(PIN_SHA256=)""$/m, `"${sha256}"`, "PIN_SHA256");
  return out;
}

/** install.ps1: điền `$PinVersion` và `$PinSha256` (hai dòng `$Name = ''` trong hàm Install-AiTranslator). */
export function pinInstallPs1(text, version, sha256) {
  check(version, sha256);
  let out = setOnce(text, /^( *\$PinVersion = )''$/m, `'${version}'`, "$PinVersion");
  out = setOnce(out, /^( *\$PinSha256 = )''$/m, `'${sha256}'`, "$PinSha256");
  return out;
}

/** Ghi hai script đã ghim vào thư mục `dist`. `pins` = { version, mac, win }: SHA-256 của .dmg và bộ cài .exe của `version`. */
export async function pinInstallers(dist, pins) {
  const { version, mac, win } = pins;
  const sh = path.join(dist, "install.sh");
  const ps1 = path.join(dist, "install.ps1");
  await writeFile(sh, pinInstallSh(await readFile(sh, "utf8"), version, mac));
  await writeFile(ps1, pinInstallPs1(await readFile(ps1, "utf8"), version, win));
}
