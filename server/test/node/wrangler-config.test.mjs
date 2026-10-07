// Khóa cấu hình wrangler (spec 2026-10-04, §4): chỉ một môi trường, production. Chạy bằng `pnpm test:scripts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** Đọc JSONC: bỏ dòng chú thích nguyên dòng (`// …`), không đụng `//` trong URL. */
function load(name) {
  const text = readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
}

const api = load("wrangler.jsonc");
const admin = load("wrangler.admin.jsonc");

for (const [name, config] of [
  ["wrangler.jsonc", api],
  ["wrangler.admin.jsonc", admin],
]) {
  test(`${name}: một môi trường, ENVIRONMENT là production`, () => {
    assert.equal("env" in config, false, "không còn khối env (staging hay production riêng)");
    assert.equal(config.vars.ENVIRONMENT, "production");
    assert.equal(config.d1_databases.length, 1);
    assert.equal(config.d1_databases[0].database_name, "mt-license-production");
    assert.doesNotMatch(JSON.stringify(config), /staging|"dev"/i);
  });
}

test("Worker admin gọi đúng Worker API qua service binding", () => {
  assert.equal(api.name, "mt-license");
  assert.equal(admin.name, "mt-license-admin");
  assert.deepEqual(admin.services, [{ binding: "API", service: "mt-license", entrypoint: "AdminRpc" }]);
});

test("Worker API bán đúng bảng gói chính thức (spec 2026-10-07 §2.1), không có giá thử", () => {
  const { monthly, yearly, ...others } = api.vars.PLANS;
  assert.deepEqual(others, {});
  assert.deepEqual(monthly, { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } });
  assert.deepEqual(yearly, { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } });
});

test("secret bắt buộc có đủ và không nằm trong vars", () => {
  assert.deepEqual(api.secrets.required, [
    "PAYOS_CLIENT_ID",
    "PAYOS_API_KEY",
    "PAYOS_CHECKSUM_KEY",
    "RESEND_API_KEY",
    "TOKEN_SIGNING_KEY_A",
    "TOKEN_SIGNING_KEY_B",
    "RATE_LIMIT_PEPPER",
  ]);
  for (const name of api.secrets.required) assert.equal(name in api.vars, false, name);
  assert.deepEqual(admin.secrets.required, ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "RESEND_API_KEY"]);
});

test("tên miền riêng aitranslator.io.vn (spec 2026-10-06): route, email gửi và origin của Worker admin", () => {
  assert.deepEqual(api.routes, [{ pattern: "api.aitranslator.io.vn", custom_domain: true }]);
  for (const config of [api, admin]) {
    assert.equal(config.vars.EMAIL_FROM, "AI Translator <no-reply@mail.aitranslator.io.vn>");
    assert.equal(config.vars.EMAIL_REPLY_TO, "support@aitranslator.io.vn");
  }
  assert.equal(admin.vars.API_ORIGIN, `https://${api.routes[0].pattern}`);
  assert.equal("routes" in admin, false, "admin giữ workers.dev, không có route (spec 2026-10-06, mục 3)");
  assert.equal(api.workers_dev, true, "giữ workers_dev tạm làm đường lui cho bản cài cũ");
});
