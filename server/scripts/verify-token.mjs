#!/usr/bin/env node
// Kiểm chữ ký một token v1 bằng khóa công khai của môi trường trong server/keys/public-keys.json
// (ô a hoặc b), như app sẽ kiểm (kế hoạch 06). Viết độc lập với src/token.ts. Đọc từ stdin một trong hai dạng:
// - token thô (ví dụ token thật từ activate):
//     printf '%s' "$TOKEN" | node scripts/verify-token.mjs staging
// - JSON {"slot","kid","token"} của POST /admin/keys/test-sign (QĐ31): kiểm thêm `kid` Worker báo khớp `kid` trong
//   token, và token nằm đúng ô dự phòng:
//     cloudflared access curl … /admin/keys/test-sign | node scripts/verify-token.mjs staging
// In "OK <env> <ô> <kid>" và claims; sai thì in "FAIL <lý do>" và thoát mã 1.
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const args = process.argv.slice(2);
const envName = args[0];
const keysAt = args.indexOf("--keys");
const keysFile = keysAt >= 0 ? args[keysAt + 1] : new URL("../keys/public-keys.json", import.meta.url);
const failWith = (why) => {
  console.log(`FAIL ${why}`);
  process.exit(1);
};
// base64url dạng chuẩn: không padding, bit thừa bằng 0 (giống crate base64 URL_SAFE_NO_PAD của app).
const strict = (s) => {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b = Buffer.from(s, "base64url");
  return b.toString("base64url") === s ? b : null;
};

let input = "";
for await (const chunk of process.stdin) input += chunk;
input = input.trim();
let token = input;
let expectedSlot = null;
let expectedKid = null;
if (input.startsWith("{")) {
  let check;
  try {
    check = JSON.parse(input);
  } catch {
    failWith("stdin không phải JSON hợp lệ");
  }
  if (typeof check.token !== "string") failWith(`không có token trong JSON: ${input.slice(0, 200)}`);
  token = check.token;
  expectedSlot = typeof check.slot === "string" ? check.slot : null;
  expectedKid = typeof check.kid === "string" ? check.kid : null;
}
const keys = JSON.parse(readFileSync(keysFile, "utf8"))[envName];
if (!keys) failWith(`không có môi trường ${envName} trong public-keys.json`);
const parts = token.split(".");
if (parts.length !== 3 || parts[0] !== "v1") failWith("malformed");
const payload = strict(parts[1]);
const sig = strict(parts[2]);
if (!payload || !sig || sig.length !== 64) failWith("malformed");
let claims;
try {
  claims = JSON.parse(payload.toString("utf8"));
} catch {
  failWith("malformed");
}
if (typeof claims !== "object" || claims === null || Array.isArray(claims) || typeof claims.kid !== "string") {
  failWith("malformed");
}
if (expectedKid !== null && expectedKid !== claims.kid) failWith(`kid_mismatch: Worker báo ${expectedKid}, token mang ${claims.kid}`);
const found = Object.entries(keys).find(([, k]) => k.kid === claims.kid);
if (!found) failWith(`unknown_kid ${claims.kid}`);
const [slot, k] = found;
const pub = await webcrypto.subtle.importKey("raw", Buffer.from(k.x, "base64url"), { name: "Ed25519" }, false, ["verify"]);
const ok = await webcrypto.subtle.verify({ name: "Ed25519" }, pub, sig, Buffer.from(`v1.${parts[1]}`));
if (!ok) failWith("bad_signature");
if (expectedSlot !== null && expectedSlot !== slot) {
  failWith(`wrong_slot: ${claims.kid} nằm ở ô ${slot} trong public-keys.json, Worker báo ô ${expectedSlot}`);
}
console.log(`OK ${envName} ${slot} ${k.kid}`);
console.log(JSON.stringify(claims));
