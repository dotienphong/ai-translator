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

test("dùng thử Free 10 ngày mỗi máy (spec 2026-10-07 §3.1)", () => {
  assert.equal(api.vars.TRIAL_DAYS, 10);
  assert.equal("TRIAL_DAYS" in admin.vars, false, "chỉ Worker API cấp token dùng thử");
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

test("Worker admin phục vụ trang Web Admin qua ASSETS, sau lớp kiểm Access (spec Web Admin §2)", () => {
  assert.deepEqual(admin.assets, {
    directory: "./admin-ui/dist",
    binding: "ASSETS",
    not_found_handling: "single-page-application",
    run_worker_first: true,
  });
  assert.equal("assets" in api, false, "Worker API không phục vụ trang");
});

test("ACCESS_AUD của Worker admin là audience tag thật (64 ký tự hex), không để trống (spec Web Admin §2)", () => {
  assert.match(admin.vars.ACCESS_AUD, /^[0-9a-f]{64}$/);
});

test("ACCESS_TEAM_DOMAIN là tên miền team Access (không có https://, không có /), để xác thực JWT khi Worker có assets", () => {
  assert.match(admin.vars.ACCESS_TEAM_DOMAIN, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/);
  assert.equal("ACCESS_TEAM_DOMAIN" in api.vars, false, "Worker API không đứng sau Access");
});

test("package.json: ui:build và ui:check báo lỗi khi tên package sai, và check chạy ui:check trước dry-run", () => {
  const { scripts } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  // pnpm thoát mã 0 khi --filter không khớp package nào (kể cả sau khi đổi tên package): thiếu cờ này thì
  // `pnpm check` vẫn xanh dù UI không được build hay test, rồi deploy Worker admin với dist cũ hay trống.
  for (const name of ["ui:build", "ui:check"]) {
    assert.match(scripts[name], /--fail-if-no-match/, `${name} thiếu --fail-if-no-match`);
    assert.match(scripts[name], /--filter mt-license-admin-ui\b/, `${name} sai tên package`);
  }
  const steps = scripts.check.split("&&").map((step) => step.trim());
  const uiCheck = steps.indexOf("pnpm ui:check");
  assert.notEqual(uiCheck, -1, "check phải chạy ui:check");
  assert.ok(steps.indexOf("pnpm dry-run") > uiCheck, "dry-run phải chạy sau ui:check để kiểm cả assets đã build");
});
