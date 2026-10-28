#!/usr/bin/env node
// `pnpm recipes:update`: kiểm công thức đọc tên đã sửa, chạy bộ test cây giao diện ghi sẵn, hỏi rồi đăng lên hệ thống; quay lại bản trước bằng
// `--revert-to` (spec 2026-10-26-phan-biet-nguoi-noi §7.1; runbook docs/release/phat-hanh.md mục 15). File này chỉ đọc tham số và nối các thứ
// thật vào luồng ở update-flow.mjs.
import { resolve } from "node:path";
import { ask, createIo } from "../models/update-io.mjs";
import { builtInKeys, REPO } from "./lib.mjs";
import { run } from "./update-flow.mjs";
import { parseArgs } from "./update-lib.mjs";

const paths = {
  repo: REPO,
  released: resolve(REPO, "scripts/speaker-recipes/released"),
  work: resolve(REPO, ".recipes-update"),
};

run(parseArgs(process.argv.slice(2)), { io: createIo(), paths, ask, keys: builtInKeys() }).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Lỗi: ${e.message}`);
    process.exit(2);
  },
);
