// Test của scripts/read-dev-env.sh: chỉ nhận khóa trong danh sách cho phép, không chạy nội dung `.env` như lệnh shell
// (spec 2026-10-04, §2.3). Chạy: `node --test scripts/dev-env.test.mjs` (macOS, cần /bin/sh).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./read-dev-env.sh", import.meta.url));

function read(t, content) {
  const dir = mkdtempSync(join(tmpdir(), "dev-env-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, ".env");
  if (content !== null) writeFileSync(file, content);
  const r = spawnSync("sh", [script, file], { encoding: "utf8" });
  return { status: r.status, out: r.stdout, err: r.stderr, dir };
}

test("nhận AI_TRANSLATOR_DEV_PRO, bỏ dòng trống và chú thích", (t) => {
  const r = read(t, "# ghi chú\n\nAI_TRANSLATOR_DEV_PRO=true\n");
  assert.equal(r.status, 0);
  assert.equal(r.out, "AI_TRANSLATOR_DEV_PRO=true\n");
});

test("không có file thì không in gì và không lỗi", (t) => {
  const r = read(t, null);
  assert.deepEqual([r.status, r.out], [0, ""]);
});

test("khóa lạ bị bỏ qua, chỉ báo tên khóa (không in giá trị)", (t) => {
  const r = read(t, "SECRET_TOKEN=abc123\nMT_LOG=1\nAI_TRANSLATOR_DEV_PRO=true\n");
  assert.equal(r.out, "AI_TRANSLATOR_DEV_PRO=true\n");
  assert.match(r.err, /SECRET_TOKEN/);
  assert.doesNotMatch(r.err, /abc123/);
});

test("không chạy nội dung .env như lệnh shell", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dev-env-inj-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marker = join(dir, "da-chay");
  const r = read(
    t,
    `AI_TRANSLATOR_DEV_PRO=true; touch ${marker}\n$(touch ${marker})\n\`touch ${marker}\`\nAI_TRANSLATOR_DEV_PRO=$(touch ${marker})\n`,
  );
  assert.equal(existsSync(marker), false, "lệnh trong .env đã bị chạy");
  // Giá trị lạ vẫn được chuyển nguyên văn cho app, và app chỉ coi đúng `true` là bật (pro.rs, switch_on).
  assert.match(r.out, /^AI_TRANSLATOR_DEV_PRO=true; touch /m);
});

test("khóa có khoảng trắng hay sai chữ hoa không được nhận; dòng không có dấu = bị bỏ qua", (t) => {
  const r = read(t, " AI_TRANSLATOR_DEV_PRO=true\nAI_TRANSLATOR_DEV_PRO =true\nai_translator_dev_pro=true\nAI_TRANSLATOR_DEV_PRO\n");
  assert.equal(r.out, "");
});

test("dòng kết thúc CRLF và dòng cuối không có xuống dòng vẫn đọc đúng", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_PRO=true\r\nAI_TRANSLATOR_DEV_PRO=false");
  assert.equal(r.out, "AI_TRANSLATOR_DEV_PRO=true\nAI_TRANSLATOR_DEV_PRO=false\n");
});
