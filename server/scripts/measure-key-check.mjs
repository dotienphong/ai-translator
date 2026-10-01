#!/usr/bin/env node
// Đo tỉ lệ ký tự kiểm tra Luhn mod 32 bắt được lỗi gõ, trên 20.000 key tất định (SHA-256 của "key-<i>").
// Viết lại thuật toán độc lập với src/license-key.ts. Dùng: node scripts/measure-key-check.mjs
import { createHash } from "node:crypto";

const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function check(body) {
  let factor = 2;
  let sum = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    const p = factor * A.indexOf(body[i]);
    sum += Math.floor(p / 32) + (p % 32);
    factor = factor === 2 ? 1 : 2;
  }
  return A[(32 - (sum % 32)) % 32];
}
const valid = (k) => check(k.slice(0, 27)) === k[27];
let sub = 0;
let subCaught = 0;
let swap = 0;
let swapCaught = 0;
for (let r = 0; r < 20000; r++) {
  const body = Array.from(createHash("sha256").update(`key-${r}`).digest().subarray(0, 27), (x) => A[x & 31]).join("");
  const key = body + check(body);
  for (let i = 0; i < 28; i++) {
    for (let d = 1; d < 32; d++) {
      sub++;
      if (!valid(key.slice(0, i) + A[(A.indexOf(key[i]) + d) % 32] + key.slice(i + 1))) subCaught++;
    }
  }
  for (let i = 0; i < 27; i++) {
    if (key[i] === key[i + 1]) continue;
    swap++;
    if (!valid(key.slice(0, i) + key[i + 1] + key[i] + key.slice(i + 2))) swapCaught++;
  }
}
const pct = (a, b) => ((100 * a) / b).toFixed(2);
console.log(`thay 1 ký tự: bắt ${subCaught}/${sub} (${pct(subCaught, sub)}%)`);
console.log(`đảo 2 ký tự kề nhau: bắt ${swapCaught}/${swap} (${pct(swapCaught, swap)}%)`);
