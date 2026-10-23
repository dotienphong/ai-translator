#!/usr/bin/env node
// `pnpm models:update`: kiểm bản mới của các model ở nguồn, chuẩn bị, chạy cổng kiểm, hỏi rồi đăng lên hệ thống; quay lại
// bản trước bằng `--rollback-to` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md; runbook
// docs/release/phat-hanh.md mục 13). File này chỉ đọc tham số và nối các thứ thật vào luồng ở update-flow.mjs.
import { resolve } from "node:path";
import { builtInKeys, REPO } from "./lib.mjs";
import { parseArgs } from "./update-lib.mjs";
import { ask, createIo } from "./update-io.mjs";
import { run } from "./update-flow.mjs";

const paths = {
  repo: REPO,
  upstream: resolve(REPO, "scripts/models/upstream.json"),
  config: resolve(REPO, "scripts/models/models.config.json"),
  released: resolve(REPO, "scripts/models/released"),
  work: resolve(REPO, "target/models-update"),
  state: resolve(REPO, "target/models-update"),
};

run(parseArgs(process.argv.slice(2)), { io: createIo(), paths, ask, keys: builtInKeys() }).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Lỗi: ${e.message}`);
    process.exit(2);
  },
);
