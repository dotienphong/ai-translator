#!/usr/bin/env node
// Ký phần thân manifest model thành models.json (kế hoạch 04, 07a; spec 2026-10-04: chỉ production). Chạy trong CI
// (sign-manifest.yml, environment `release`) với khóa lấy từ secret MANIFEST_SIGNING_KEY.
// - --key: file JWK khóa riêng (gen-manifest-key.mjs), phải nằm ngoài repo và chỉ chủ file đọc được.
// - kid của khóa phải có trong khối production của manifest-public-keys.json, đúng khóa công khai: app mới nhận manifest này.
// - Ký xong thì tự kiểm lại bằng khóa build sẵn rồi mới ghi --out.
//
//   node scripts/models/sign-manifest.mjs --key /đường/dẫn/khóa.jwk --body body.json --out models.json
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { builtInKeys, importPrivateJwk, insideRepo, KEYS_FILE, signBody, verifyEnvelope } from "./lib.mjs";

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
if (!keyPath || !bodyPath || !outPath) fail("Tham số: --key <JWK> --body <phần thân> --out <models.json> [--keys <file>]");
if (insideRepo(keyPath)) fail("Khóa riêng không được nằm trong repo.");
if (process.platform !== "win32" && (statSync(keyPath).mode & 0o077) !== 0) fail(`${keyPath} phải chỉ chủ file đọc được (chmod 600).`);
const jwk = JSON.parse(readFileSync(keyPath, "utf8"));
const trusted = builtInKeys(keysFile);
const known = trusted.find((k) => k.kid === jwk.kid);
if (!known) fail(`kid ${jwk.kid} không có trong khối production của ${keysFile}: app sẽ không nhận manifest này.`);
if (known.x !== jwk.x) fail(`Khóa công khai của ${jwk.kid} trong ${keysFile} không khớp khóa riêng.`);
const body = readFileSync(bodyPath);
const parsed = JSON.parse(body.toString("utf8"));
if (parsed.schema !== 1 || !Number.isSafeInteger(parsed.sequence)) fail("Phần thân không đúng schema 1.");
const envelope = await signBody(await importPrivateJwk(jwk), jwk.kid, JSON.stringify(parsed));
await verifyEnvelope(envelope, trusted);
writeFileSync(outPath, `${JSON.stringify(envelope)}\n`);
console.error(`Đã ký ${outPath}: kid ${jwk.kid}, sequence ${parsed.sequence}.`);
