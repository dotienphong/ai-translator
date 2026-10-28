#!/usr/bin/env node
// Ký phần thân công thức đọc tên thành recipes.json (kế hoạch 06; spec 2026-10-26-phan-biet-nguoi-noi §7.1). Chạy trong CI
// (sign-recipes.yml, environment `release`) với khóa lấy từ secret MANIFEST_SIGNING_KEY (cùng khóa ký manifest model; tiền tố ký
// riêng nên chữ ký này không dùng được cho manifest model).
// - --key: file JWK khóa riêng (gen-manifest-key.mjs), phải nằm ngoài repo và chỉ chủ file đọc được.
// - kid của khóa phải có trong khối production của manifest-public-keys.json, đúng khóa công khai: app mới nhận công thức này.
// - Ký xong thì tự kiểm lại bằng khóa build sẵn rồi mới ghi --out.
//
//   node scripts/speaker-recipes/sign-recipes.mjs --key /đường/dẫn/khóa.jwk --body recipes.json --out target/recipes/recipes.json
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { builtInKeys, importPrivateJwk, insideRepo, KEYS_FILE, signRecipes, verifyRecipes } from "./lib.mjs";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const keyPath = opt("--key");
const bodyPath = opt("--body");
const outPath = opt("--out");
const keysFile = opt("--keys") ?? KEYS_FILE;
if (!keyPath || !bodyPath || !outPath) fail("Tham số: --key <JWK> --body <phần thân> --out <recipes.json> [--keys <file>]");
if (insideRepo(keyPath)) fail("Khóa riêng không được nằm trong repo.");
if (process.platform !== "win32" && (statSync(keyPath).mode & 0o077) !== 0) fail(`${keyPath} phải chỉ chủ file đọc được (chmod 600).`);
const jwk = JSON.parse(readFileSync(keyPath, "utf8"));
const trusted = builtInKeys(keysFile);
const known = trusted.find((k) => k.kid === jwk.kid);
if (!known) fail(`kid ${jwk.kid} không có trong khối production của ${keysFile}: app sẽ không nhận công thức này.`);
if (known.x !== jwk.x) fail(`Khóa công khai của ${jwk.kid} trong ${keysFile} không khớp khóa riêng.`);
const parsed = JSON.parse(readFileSync(bodyPath, "utf8"));
if (parsed.schema !== 1 || !Number.isSafeInteger(parsed.version) || parsed.version < 1) fail("Phần thân không đúng schema 1 hay thiếu `version` ≥ 1.");
const body = JSON.stringify(parsed);
const envelope = await signRecipes(await importPrivateJwk(jwk), jwk.kid, body);
if ((await verifyRecipes(envelope, trusted)) !== body) fail("Bản đã ký không trả lại đúng phần thân.");
writeFileSync(outPath, `${JSON.stringify(envelope)}\n`);
console.error(`Đã ký ${outPath}: kid ${jwk.kid}, version ${parsed.version}.`);
