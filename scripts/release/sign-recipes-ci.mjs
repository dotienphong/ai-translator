#!/usr/bin/env node
// Bước ký công thức đọc tên của sign-recipes.yml (kế hoạch 06; spec 2026-10-26-phan-biet-nguoi-noi §7.1). Chạy ở job có secret, sau job
// `check` (không secret) đã kiểm phần thân bằng đúng luật của app (`check_recipes_body` của crate speaker-ops).
//
//   MANIFEST_SIGNING_KEY=<JWK> BODY=<đường dẫn trong repo> node scripts/release/sign-recipes-ci.mjs
//   BODY=<…> [PREVIOUS=<…>] [FIRST_RELEASE=true] node scripts/release/sign-recipes-ci.mjs --check   # job `check`: chỉ kiểm đầu vào
//
// `PREVIOUS` (phần thân của bản đang phát hành) bắt buộc trừ khi người chạy khai đây là lần đăng công thức đầu tiên (`FIRST_RELEASE`):
// thiếu nó thì `check_recipes_body` không so số phiên bản với bản đó (chống quay lui ở phía đăng, như sign-manifest-ci.mjs).
//
// Ghi khóa riêng ra file tạm quyền 0600 ngoài repo (sign-recipes.mjs đòi vậy), chạy sign-recipes.mjs với môi trường không còn biến khóa,
// rồi xóa file khóa dù thành công hay lỗi. Ra: target/recipes/recipes.json.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { bodyErrors } from "./sign-manifest-ci.mjs";
import { root as repoRoot } from "./versions.mjs";

/** Lỗi của các đầu vào của job `check`: BODY như `bodyErrors`; PREVIOUS bắt buộc trừ khi `first`; khai `first` mà vẫn đưa PREVIOUS là mâu thuẫn. */
export function inputErrors(root, body, previous, first = false) {
  const errors = bodyErrors(root, body);
  if (first && previous) errors.push("FIRST_RELEASE và PREVIOUS không đi cùng nhau: lần đầu thì không có bản trước");
  else if (previous) errors.push(...bodyErrors(root, previous, "PREVIOUS"));
  else if (!first) errors.push("PREVIOUS trống: phải so với phần thân của bản đang phát hành; lần đăng công thức đầu tiên thì tick first_release");
  return errors;
}

export function main(env = process.env, root = repoRoot) {
  const key = env.MANIFEST_SIGNING_KEY;
  if (!key) throw new Error("environment release chưa có secret MANIFEST_SIGNING_KEY");
  const script = join(root, "scripts/speaker-recipes/sign-recipes.mjs");
  if (!existsSync(script)) throw new Error("chưa có scripts/speaker-recipes/sign-recipes.mjs");
  const errors = bodyErrors(root, env.BODY);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const dir = env.RUNNER_TEMP ?? tmpdir();
  const keyFile = join(dir, `recipes-signing-key-${process.pid}.jwk`);
  const childEnv = { ...env };
  delete childEnv.MANIFEST_SIGNING_KEY;
  try {
    writeFileSync(keyFile, key, { mode: 0o600 });
    mkdirSync(join(root, "target", "recipes"), { recursive: true });
    const out = join(root, "target", "recipes", "recipes.json");
    const r = spawnSync(process.execPath, [script, "--key", keyFile, "--body", join(root, env.BODY), "--out", out], {
      cwd: root,
      env: childEnv,
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error(`sign-recipes.mjs thoát mã ${r.status}`);
    return out;
  } finally {
    rmSync(keyFile, { force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    if (process.argv.includes("--check")) {
      const errors = inputErrors(repoRoot, process.env.BODY, process.env.PREVIOUS, process.env.FIRST_RELEASE === "true");
      if (errors.length > 0) throw new Error(errors.join("; "));
      console.log("BODY, PREVIOUS hợp lệ");
    } else console.log(`đã ký ${main()}`);
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
