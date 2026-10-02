#!/usr/bin/env node
// Dựng phần thân manifest model từ cấu hình và các file model trên máy (kế hoạch 04): đọc
// scripts/models/models.config.json, tính `bytes` và `sha256` của từng file trong --dir, ghi phần thân JSON ra stdout.
// Phần thân chưa ký; ký bằng sign-manifest.mjs.
//
//   node scripts/models/build-manifest.mjs --dir <thư mục chứa file> --sequence 1 > body.json
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { REPO } from "./lib.mjs";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = opt("--dir");
const sequence = Number(opt("--sequence"));
const config = JSON.parse(readFileSync(opt("--config") ?? resolve(REPO, "scripts/models/models.config.json"), "utf8"));
const publishedAt = opt("--published-at") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
if (!dir) fail("Thiếu --dir <thư mục chứa các file model>.");
if (!Number.isSafeInteger(sequence) || sequence < 1) fail("--sequence phải là số nguyên dương, lớn hơn số của manifest đang phát hành.");

const sha256 = (path) =>
  new Promise((ok, err) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => ok(hash.digest("hex")))
      .on("error", err);
  });

const files = [];
for (const entry of config.files) {
  const path = join(dir, entry.file);
  let bytes;
  try {
    bytes = statSync(path).size;
  } catch {
    fail(`Thiếu file ${path}.`);
  }
  files.push({ ...entry, bytes, sha256: await sha256(path) });
}
const body = {
  schema: 1,
  sequence,
  published_at: publishedAt,
  files,
  packs: config.packs,
  recommend: config.recommend,
  ...(config.pipeline ? { pipeline: config.pipeline } : {}),
};
process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
