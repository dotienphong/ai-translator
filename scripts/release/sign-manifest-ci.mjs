#!/usr/bin/env node
// Bước ký manifest model production của sign-manifest.yml (kế hoạch 07a; Q17 của kế hoạch 00). Chạy ở job có secret,
// sau job `check` (không secret) đã kiểm phần thân bằng đúng luật của app (`check_manifest_body` của kế hoạch 04).
//
//   MANIFEST_SIGNING_KEY=<JWK> BODY=<đường dẫn trong repo> node scripts/release/sign-manifest-ci.mjs
//   BODY=<…> PREVIOUS=<…> node scripts/release/sign-manifest-ci.mjs --check   # job `check`: chỉ kiểm hai đường dẫn
//
// `PREVIOUS` (phần thân của bản đang phát hành) bắt buộc khi khối `production` của manifest-public-keys.json đã có khóa, tức
// là đã có thể có manifest production đang phát hành: thiếu nó thì `check_manifest_body` không so `id` với bản đó (N-8 của
// review 04 lần 2; N-2 của review 07a lần 2).
//
// Ghi khóa riêng ra file tạm quyền 0600 ngoài repo (sign-manifest.mjs của 04 đòi vậy), chạy sign-manifest.mjs
// `--env production` với môi trường không còn biến khóa, rồi xóa file khóa dù thành công hay lỗi. Ra:
// target/manifest/models.json.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import { root as repoRoot } from "./versions.mjs";

/** Lỗi của đường dẫn phần thân: phải tương đối, nằm trong repo, không có `..`, và là một file có thật. */
export function bodyErrors(root, body, what = "BODY") {
  if (!body) return [`${what} trống`];
  if (isAbsolute(body) || body.startsWith("/") || body.startsWith("\\")) return [`${what} phải là đường dẫn tương đối trong repo`];
  if (body.split(/[\\/]/).includes("..")) {
    return [`${what} không được có '..'`];
  }
  const full = join(root, body);
  if (!existsSync(full) || !statSync(full).isFile()) return [`không thấy ${body}`];
  return [];
}

/** Lỗi của hai đầu vào của job `check`: BODY như trên; PREVIOUS bắt buộc khi khối production đã có khóa. */
export function inputErrors(root, body, previous) {
  const errors = bodyErrors(root, body);
  const keys = JSON.parse(readFileSync(join(root, "src-tauri/keys/manifest-public-keys.json"), "utf8"));
  const released = Array.isArray(keys.production) && keys.production.length > 0;
  if (previous) errors.push(...bodyErrors(root, previous, "PREVIOUS"));
  else if (released) {
    errors.push("PREVIOUS trống: đã có khóa production nên phải so với phần thân của bản đang phát hành (N-8 của review 04)");
  }
  return errors;
}

export function main(env = process.env, root = repoRoot) {
  const key = env.MANIFEST_SIGNING_KEY;
  if (!key) throw new Error("environment release chưa có secret MANIFEST_SIGNING_KEY");
  const script = join(root, "scripts/models/sign-manifest.mjs");
  if (!existsSync(script)) throw new Error("chưa có scripts/models/sign-manifest.mjs (kế hoạch 04)");
  const errors = bodyErrors(root, env.BODY);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const dir = env.RUNNER_TEMP ?? tmpdir();
  const keyFile = join(dir, `manifest-signing-key-${process.pid}.jwk`);
  const childEnv = { ...env };
  delete childEnv.MANIFEST_SIGNING_KEY;
  try {
    writeFileSync(keyFile, key, { mode: 0o600 });
    mkdirSync(join(root, "target", "manifest"), { recursive: true });
    const out = join(root, "target", "manifest", "models.json");
    const r = spawnSync(
      process.execPath,
      [script, "--env", "production", "--key", keyFile, "--body", join(root, env.BODY), "--out", out],
      { cwd: root, env: childEnv, stdio: "inherit" },
    );
    if (r.status !== 0) throw new Error(`sign-manifest.mjs thoát mã ${r.status}`);
    return out;
  } finally {
    rmSync(keyFile, { force: true });
  }
}


if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    if (process.argv.includes("--check")) {
      const errors = inputErrors(repoRoot, process.env.BODY, process.env.PREVIOUS);
      if (errors.length > 0) throw new Error(errors.join("; "));
      console.log("BODY, PREVIOUS hợp lệ");
    } else console.log(`đã ký ${main()}`);
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
