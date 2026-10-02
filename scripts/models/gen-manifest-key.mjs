#!/usr/bin/env node
// Tạo cặp khóa Ed25519 ký manifest model cho môi trường staging (Đ8 của kế hoạch 00; kế hoạch 04).
// - Khóa riêng ghi ra file JWK ở --out: đường dẫn tuyệt đối, NGOÀI repo, chưa có file; quyền 0600. Không in ra terminal.
//   Khóa này chỉ để ký manifest staging trên máy người vận hành; khóa production tạo và giữ trong CI (kế hoạch 07).
// - Khóa công khai `{ "kid", "x" }` in ra stdout, để thêm vào khối "staging" của src-tauri/keys/manifest-public-keys.json.
// - kid dạng stg-<năm>-<tháng>-<số thứ tự>, chưa có trong manifest-public-keys.json (--keys để chỉ file khác).
//
//   node scripts/models/gen-manifest-key.mjs stg-2026-10-1 --out "$HOME/.config/ai-translator/manifest-stg-2026-10-1.jwk"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { webcrypto } from "node:crypto";
import { KEYS_FILE, insideRepo } from "./lib.mjs";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const [kid, ...rest] = process.argv.slice(2);
let out = null;
let keysFile = KEYS_FILE;
for (let i = 0; i < rest.length; i += 2) {
  if (rest[i] === "--out" && rest[i + 1]) out = rest[i + 1];
  else if (rest[i] === "--keys" && rest[i + 1]) keysFile = rest[i + 1];
  else fail("Tham số: <kid> --out <file JWK ngoài repo> [--keys <manifest-public-keys.json>]");
}
if (!kid || !/^stg-\d{4}-\d{2}-[1-9]\d{0,3}$/.test(kid)) fail("kid phải dạng stg-<năm>-<tháng>-<số thứ tự>, ví dụ stg-2026-10-1.");
if (!out || !isAbsolute(out)) fail("--out phải là đường dẫn tuyệt đối.");
if (insideRepo(out)) fail("Khóa riêng không được nằm trong repo.");
if (existsSync(out)) fail(`${out} đã có; không ghi đè khóa cũ.`);
const known = JSON.parse(readFileSync(keysFile, "utf8"));
for (const [env, list] of Object.entries(known)) {
  if (Array.isArray(list) && list.some((k) => k?.kid === kid)) fail(`kid ${kid} đã có trong khối ${env}. Dùng số thứ tự mới.`);
}
const { privateKey } = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = await webcrypto.subtle.exportKey("jwk", privateKey);
mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
writeFileSync(out, JSON.stringify({ kty: "OKP", crv: "Ed25519", kid, d: jwk.d, x: jwk.x }), { mode: 0o600, flag: "wx" });
process.stdout.write(`${JSON.stringify({ kid, x: jwk.x })}\n`);
console.error(`Đã ghi khóa riêng vào ${out} (0600). Thêm dòng trên vào khối "staging" của ${keysFile}.`);
