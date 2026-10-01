#!/usr/bin/env node
// Tạo cặp khóa Ed25519 ký token bản quyền (spec §10.2, Q11, QĐ29). Không ghi file nào ra đĩa, không in khóa riêng
// ra terminal, không dùng kho mật khẩu (P05-6).
// - Khóa riêng ra stdout, và stdout phải là pipe (hoặc socket): terminal và file đều bị từ chối.
//   Pipe thẳng vào `wrangler secret put` của ô khóa A hoặc B. Secret của Worker không đọc lại được, nên khóa riêng
//   chỉ còn ở đó.
// - Khóa công khai ra stderr, để ghi vào server/keys/public-keys.json (không phải bí mật).
// - kid phải là duy nhất: script từ chối kid đã có trong public-keys.json (--keys để chỉ file khác).
//   Quy ước: <env>-<năm>-<tháng>-<số thứ tự>; mỗi khóa mới, kể cả khóa dự phòng, lấy số thứ tự kế tiếp.
//
//   node scripts/gen-token-key.mjs stg-2026-10-1 | pnpm exec wrangler secret put TOKEN_SIGNING_KEY_A --env staging
//   node scripts/gen-token-key.mjs stg-2026-10-2 | pnpm exec wrangler secret put TOKEN_SIGNING_KEY_B --env staging
import { existsSync, fstatSync, readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const [kid, ...rest] = process.argv.slice(2);
let keysFile = new URL("../keys/public-keys.json", import.meta.url);
for (let i = 0; i < rest.length; i += 2) {
  if (rest[i] === "--keys" && rest[i + 1]) keysFile = rest[i + 1];
  else fail("Tham số sau kid chỉ có thể là --keys <file>.");
}
if (!kid || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(kid) || kid.startsWith("test-")) {
  fail("Cần kid gồm chữ thường, số và '-', tối đa 32 ký tự, không bắt đầu bằng 'test-'. Ví dụ: stg-2026-10-1");
}
const out = fstatSync(1);
if (!out.isFIFO() && !out.isSocket()) {
  fail("stdout phải là pipe (không phải terminal, không phải file): pipe thẳng vào `wrangler secret put`.");
}
if (existsSync(keysFile)) {
  for (const [envName, slots] of Object.entries(JSON.parse(readFileSync(keysFile, "utf8")))) {
    for (const [slot, k] of Object.entries(slots ?? {})) {
      if (k?.kid === kid) fail(`kid ${kid} đã có trong public-keys.json (${envName}.${slot}). Dùng số thứ tự mới.`);
    }
  }
}
const { privateKey } = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = await webcrypto.subtle.exportKey("jwk", privateKey);
process.stdout.write(JSON.stringify({ kty: "OKP", crv: "Ed25519", kid, d: jwk.d, x: jwk.x }));
console.error(`Khóa công khai (ghi vào server/keys/public-keys.json): ${JSON.stringify({ kid, x: jwk.x })}`);
