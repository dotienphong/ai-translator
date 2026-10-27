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
    `AI_TRANSLATOR_DEV_PRO=$(touch ${marker})\n$(touch ${marker})\n\`touch ${marker}\`\nAI_TRANSLATOR_DEV_PRO=true; touch ${marker}\n`,
  );
  assert.equal(existsSync(marker), false, "lệnh trong .env đã bị chạy");
  // Giá trị lạ vẫn được chuyển nguyên văn cho app (lần xuất hiện cuối), và app chỉ coi đúng `true` là bật (pro.rs, switch_on).
  assert.match(r.out, /^AI_TRANSLATOR_DEV_PRO=true; touch /m);
  assert.equal(r.out.split("\n").filter(Boolean).length, 1);
});

test("khóa có khoảng trắng hay sai chữ hoa không được nhận; dòng không có dấu = bị bỏ qua", (t) => {
  const r = read(t, " AI_TRANSLATOR_DEV_PRO=true\nAI_TRANSLATOR_DEV_PRO =true\nai_translator_dev_pro=true\nAI_TRANSLATOR_DEV_PRO\n");
  assert.equal(r.out, "");
});

test("dòng kết thúc CRLF và dòng cuối không có xuống dòng vẫn đọc đúng", (t) => {
  assert.equal(read(t, "AI_TRANSLATOR_DEV_PRO=true\r\n").out, "AI_TRANSLATOR_DEV_PRO=true\n");
  assert.equal(read(t, "AI_TRANSLATOR_DEV_PRO=true").out, "AI_TRANSLATOR_DEV_PRO=true\n");
  assert.equal(read(t, "# c\r\nAI_TRANSLATOR_DEV_PRO=false\r\n").out, "AI_TRANSLATOR_DEV_PRO=false\n");
});

test("khóa cho phép xuất hiện nhiều lần: lần cuối thắng (giống `open --env`)", (t) => {
  assert.equal(read(t, "AI_TRANSLATOR_DEV_PRO=true\nAI_TRANSLATOR_DEV_PRO=false\n").out, "AI_TRANSLATOR_DEV_PRO=false\n");
  assert.equal(read(t, "AI_TRANSLATOR_DEV_PRO=false\nAI_TRANSLATOR_DEV_PRO=true\n").out, "AI_TRANSLATOR_DEV_PRO=true\n");
  assert.equal(
    read(t, "AI_TRANSLATOR_DEV_PRO=true\nKHAC=1\nAI_TRANSLATOR_DEV_PRO=false\n").out,
    "AI_TRANSLATOR_DEV_PRO=false\n",
  );
});

test("giá trị lạ của AI_TRANSLATOR_DEV_PRO vẫn được chuyển nguyên văn nhưng có cảnh báo ở stderr (không in giá trị)", (t) => {
  for (const value of ['"true"', "1", "TRUE", "true ", ""]) {
    const r = read(t, `AI_TRANSLATOR_DEV_PRO=${value}\n`);
    assert.equal(r.out, `AI_TRANSLATOR_DEV_PRO=${value}\n`);
    assert.match(r.err, /AI_TRANSLATOR_DEV_PRO có giá trị lạ/);
    assert.ok(!r.err.includes("TRUE"), "không in giá trị ra stderr");
  }
});

test("giá trị true hoặc false thì không cảnh báo", (t) => {
  assert.equal(read(t, "AI_TRANSLATOR_DEV_PRO=true\n").err, "");
  assert.equal(read(t, "AI_TRANSLATOR_DEV_PRO=false\n").err, "");
  // Lần cuối mới tính: lạ rồi đúng thì không cảnh báo.
  assert.equal(read(t, "AI_TRANSLATOR_DEV_PRO=1\nAI_TRANSLATOR_DEV_PRO=true\n").err, "");
});

test("tên khóa không hợp lệ (có khoảng trắng, rỗng, `export `) bị từ chối và không lộ giá trị", (t) => {
  const r = read(
    t,
    "export AI_TRANSLATOR_DEV_PRO=true\n=true\nAI_TRANSLATOR DEV_PRO=true\n-AI_TRANSLATOR_DEV_PRO=true\n1AI=bi-mat-xyz\n",
  );
  assert.equal(r.out, "");
  assert.doesNotMatch(r.err, /bi-mat-xyz/);
});

test("khóa chỉ là một phần của tên cho phép (tiền tố, hậu tố) không được nhận", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_PRO_X=true\nAI_TRANSLATOR_DEV=true\nXAI_TRANSLATOR_DEV_PRO=true\n");
  assert.equal(r.out, "");
});

// Công tắc tự gửi báo cáo lỗi của bản dev (spec 2026-10-17).
test("nhận AI_TRANSLATOR_DEV_REPORTS cùng AI_TRANSLATOR_DEV_PRO, bỏ khóa khác", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_PRO=false\nSECRET=x\nAI_TRANSLATOR_DEV_REPORTS=true\n");
  assert.equal(r.out, "AI_TRANSLATOR_DEV_PRO=false\nAI_TRANSLATOR_DEV_REPORTS=true\n");
  assert.match(r.err, /bỏ qua khóa \.env không được phép: SECRET/);
  assert.equal(read(t, "AI_TRANSLATOR_DEV_REPORTS=true\n").err, "");
  assert.equal(read(t, "AI_TRANSLATOR_DEV_REPORTS=false\n").err, "");
});

test("giá trị lạ của AI_TRANSLATOR_DEV_REPORTS vẫn được chuyển nguyên văn nhưng có cảnh báo (không in giá trị)", (t) => {
  for (const value of ['"true"', "1", "TRUE", "true ", ""]) {
    const r = read(t, `AI_TRANSLATOR_DEV_REPORTS=${value}\n`);
    assert.equal(r.out, `AI_TRANSLATOR_DEV_REPORTS=${value}\n`);
    assert.match(r.err, /AI_TRANSLATOR_DEV_REPORTS có giá trị lạ/);
    assert.ok(!r.err.includes("TRUE"), "không in giá trị ra stderr");
  }
  // Lần cuối mới tính, như công tắc Pro.
  assert.equal(read(t, "AI_TRANSLATOR_DEV_REPORTS=1\nAI_TRANSLATOR_DEV_REPORTS=true\n").err, "");
});

test("khóa chỉ giống tên công tắc báo cáo lỗi (tiền tố, hậu tố, viết thường) không được nhận", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_REPORTS_X=true\nAI_TRANSLATOR_REPORTS=true\nai_translator_dev_reports=true\n");
  assert.equal(r.out, "");
});

// Cờ bật nhận giọng của bản dev (spec 2026-10-26-phan-biet-nguoi-noi, kế hoạch 02).
test("nhận AI_TRANSLATOR_DEV_SPEAKER, giá trị lạ có cảnh báo không in giá trị", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_SPEAKER=true\nSECRET=x\n");
  assert.equal(r.out, "AI_TRANSLATOR_DEV_SPEAKER=true\n");
  assert.equal(read(t, "AI_TRANSLATOR_DEV_SPEAKER=false\n").err, "");
  for (const value of ["1", "TRUE", "true ", ""]) {
    const odd = read(t, `AI_TRANSLATOR_DEV_SPEAKER=${value}\n`);
    assert.equal(odd.out, `AI_TRANSLATOR_DEV_SPEAKER=${value}\n`);
    assert.match(odd.err, /AI_TRANSLATOR_DEV_SPEAKER có giá trị lạ/);
    assert.ok(!odd.err.includes("TRUE"), "không in giá trị ra stderr");
  }
});

test("khóa chỉ giống tên cờ nhận giọng không được nhận", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_SPEAKER_X=true\nAI_TRANSLATOR_SPEAKER=true\nai_translator_dev_speaker=true\n");
  assert.equal(r.out, "");
});
