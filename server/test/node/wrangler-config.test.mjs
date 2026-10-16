// Khóa cấu hình wrangler (spec 2026-10-04, §4): chỉ một môi trường, production. Chạy bằng `pnpm test:scripts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** Văn bản thô của file cấu hình (cả chú thích). */
function raw(name) {
  return readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
}

/** Đọc JSONC: bỏ dòng chú thích nguyên dòng (`// …`), không đụng `//` trong URL. */
function load(name) {
  return JSON.parse(raw(name).replace(/^\s*\/\/.*$/gm, ""));
}

/**
 * Lý do CREEM_PRODUCT_IDS sai, hay null nếu đúng. Đúng là cả ba rỗng (không bán thẻ) hay cả ba mã `prod_…` khác nhau (bán
 * thẻ). Điền dở hay trùng mã thì server không báo gì mà chỉ thôi bán USD (src/payment/creem.ts, parseProductIds).
 */
function productIdsProblem(ids) {
  const values = Object.values(ids);
  if (values.every((id) => id === "")) return null;
  const bad = values.filter((id) => !/^prod_[A-Za-z0-9_-]+$/.test(id));
  if (bad.length > 0) return `điền dở hay sai dạng (${JSON.stringify(bad)}): server sẽ không bán USD`;
  if (new Set(values).size !== values.length) return "hai gói trùng mã sản phẩm: server sẽ không bán USD";
  return null;
}

/**
 * Lý do một file cấu hình Worker admin giữ secret webhook Creem (trong `vars` hay `secrets.required`), hay null nếu không.
 * Worker admin chỉ hỏi trạng thái phiên bằng khóa API; không nhận webhook nên không được giữ secret webhook (QĐ-2, kế hoạch 06 B3):
 * nằm trong `secrets.required` thì wrangler còn từ chối deploy cho tới khi ai đó đặt secret ấy lên Worker admin.
 */
function webhookSecretProblem(config) {
  if ("CREEM_WEBHOOK_SECRET" in (config.vars ?? {})) return "CREEM_WEBHOOK_SECRET nằm trong vars";
  if ((config.secrets?.required ?? []).includes("CREEM_WEBHOOK_SECRET")) return "CREEM_WEBHOOK_SECRET nằm trong secrets.required";
  return null;
}

/**
 * Mẫu khóa API Creem và secret webhook: không bao giờ được nằm trong file cấu hình (repo CÔNG KHAI). Tên biến như CREEM_API_KEY
 * viết hoa, không có đuôi dài nên không trùng mẫu. Khóa Creem có hai dạng: `creem_test_<chuỗi>` (sandbox) và `creem_<chuỗi>`
 * (production); phần chuỗi có thể có `_` hay `-` nên mẫu chỉ gồm chữ số thuần (`creem_[A-Za-z0-9]{8,}`) KHÔNG bắt được
 * `creem_test_…` (dấu `_` sau `test` cắt chuỗi ở 4 ký tự). Secret webhook: `whsec_<chuỗi>`.
 */
const SECRET_PATTERNS = [
  /creem_[A-Za-z0-9]{8,}/,
  /whsec_[A-Za-z0-9]{8,}/,
  /creem_test_[A-Za-z0-9_-]{8,}/,
  /creem_[A-Za-z0-9_-]{16,}/,
];

/** Chuỗi giống bí mật Creem trong một đoạn văn bản (file thô hay cấu hình đã stringify), hay null nếu sạch. */
function secretProblem(text) {
  const pattern = SECRET_PATTERNS.find((candidate) => candidate.test(text));
  return pattern ? `có chuỗi giống bí mật Creem (${pattern})` : null;
}

/** Mã sản phẩm Creem thật (`prod_<chuỗi>`): chữ số thuần, dài hơn mã giữ chỗ ngắn trong test. Dấu `…` trong chú thích không khớp. */
const PRODUCT_ID_PATTERN = /prod_[A-Za-z0-9]{8,}/;

/**
 * Lý do một file cấu hình giữ mã sản phẩm Creem thật ở chỗ không được phép, hay null. Chỗ duy nhất được phép là giá trị của
 * `vars.CREEM_PRODUCT_IDS` ở wrangler.jsonc (khi bán thẻ; không phải bí mật nhưng không nên rải ở chú thích hay file khác).
 * Worker admin không tạo phiên nên không có chỗ nào được phép.
 */
function strayProductIdProblem(text) {
  const withoutAllowed = text.replace(/"CREEM_PRODUCT_IDS"\s*:\s*\{[^}]*\}/, "");
  return PRODUCT_ID_PATTERN.test(withoutAllowed) ? "có mã sản phẩm Creem (prod_…) ngoài vars.CREEM_PRODUCT_IDS của Worker API" : null;
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

test("Worker API bán đúng bảng gói chính thức (spec 2026-10-07 §2.1, spec 2026-10-13 §1), không có giá thử", () => {
  const { monthly, six_months: sixMonths, yearly, ...others } = api.vars.PLANS;
  assert.deepEqual(others, {});
  assert.deepEqual(monthly, { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000, USD: 399 } });
  assert.deepEqual(sixMonths, { quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000, USD: 2199 } });
  assert.deepEqual(yearly, { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000, USD: 3999 } });
  assert.deepEqual(Object.keys(api.vars.PLANS), ["monthly", "six_months", "yearly"], "thứ tự gói trong cấu hình theo thời hạn");
});

test("giá USD giữ tỉ lệ giá mỗi ngày giữa MỌI cặp gói gần bảng VND, sai số 3% (spec 2026-10-14 D2)", () => {
  const perDay = (code, currency) => api.vars.PLANS[code].prices[currency] / api.vars.PLANS[code].days_per_order;
  const codes = Object.keys(api.vars.PLANS);
  assert.equal(codes.length, 3);
  for (const [i, from] of codes.entries()) {
    for (const to of codes.slice(i + 1)) {
      const vnd = perDay(to, "VND") / perDay(from, "VND");
      const usd = perDay(to, "USD") / perDay(from, "USD");
      assert.ok(Math.abs(usd / vnd - 1) <= 0.03, `${from}→${to}: tỉ lệ USD ${usd.toFixed(4)} lệch tỉ lệ VND ${vnd.toFixed(4)} quá 3%`);
    }
  }
});

test("Creem (spec 2026-10-14): production cố định, không sandbox; Worker API có đúng ba mã gói, Worker admin cùng gốc API và không có mã sản phẩm", () => {
  assert.equal(api.vars.CREEM_BASE_URL, "https://api.creem.io");
  assert.deepEqual(Object.keys(api.vars.CREEM_PRODUCT_IDS), ["monthly", "six_months", "yearly"]);
  assert.doesNotMatch(JSON.stringify(api), /test-api\.creem\.io/);
  // Worker admin chỉ hỏi trạng thái phiên của đơn Creem: cùng gốc API production, không cần mã sản phẩm.
  assert.equal(admin.vars.CREEM_BASE_URL, api.vars.CREEM_BASE_URL);
  assert.equal("CREEM_PRODUCT_IDS" in admin.vars, false, "Worker admin không tạo phiên nên không cần mã sản phẩm");
  assert.doesNotMatch(JSON.stringify(admin), /test-api\.creem\.io/);
});

test("Worker admin chỉ có khóa API Creem để xem trạng thái đơn: không có CREEM_WEBHOOK_SECRET, cả trong vars lẫn secrets.required (QĐ-2)", () => {
  assert.equal(webhookSecretProblem(admin), null, webhookSecretProblem(admin) ?? "");
  // Luật bắt được lệch (kiểm trong bộ nhớ, không đụng file): secret webhook vào vars hay secrets.required của Worker admin thì đỏ.
  assert.match(webhookSecretProblem({ vars: { CREEM_WEBHOOK_SECRET: "x" }, secrets: { required: [] } }), /vars/);
  assert.match(webhookSecretProblem({ vars: {}, secrets: { required: ["CREEM_API_KEY", "CREEM_WEBHOOK_SECRET"] } }), /secrets\.required/);
  assert.equal(webhookSecretProblem({ vars: {}, secrets: { required: ["CREEM_API_KEY"] } }), null);
  // Worker API thì ngược lại: có secret webhook (nhận webhook), và khóa API.
  assert.ok(api.secrets.required.includes("CREEM_WEBHOOK_SECRET"));
  assert.ok(admin.secrets.required.includes("CREEM_API_KEY"), "thiếu khóa API thì wrangler từ chối deploy thay vì để mọi đơn Creem trên Web Admin trả 502");
});

test("CREEM_PRODUCT_IDS: cả ba rỗng (không bán thẻ) hay cả ba prod_… khác nhau; điền dở hay trùng mã thì đỏ", () => {
  assert.equal(productIdsProblem(api.vars.CREEM_PRODUCT_IDS), null, productIdsProblem(api.vars.CREEM_PRODUCT_IDS) ?? "");
  // Luật bắt được lệch (kiểm trong bộ nhớ, không đụng file): đủ ba mã khác nhau thì đạt, điền dở, sai dạng hay trùng mã thì đỏ.
  assert.equal(productIdsProblem({ monthly: "prod_aaa111", six_months: "prod_bbb222", yearly: "prod_ccc333" }), null);
  assert.match(productIdsProblem({ monthly: "prod_aaa111", six_months: "", yearly: "prod_ccc333" }), /điền dở/);
  assert.match(productIdsProblem({ monthly: "aaa111", six_months: "prod_bbb222", yearly: "prod_ccc333" }), /sai dạng/);
  assert.match(productIdsProblem({ monthly: "prod_aaa111", six_months: "prod_aaa111", yearly: "prod_ccc333" }), /trùng mã/);
});

test("hai file wrangler không chứa khóa API hay secret webhook của Creem, kể cả trong chú thích hay vars của Worker admin", () => {
  for (const name of ["wrangler.jsonc", "wrangler.admin.jsonc"]) {
    const text = raw(name);
    assert.equal(secretProblem(text), null, `${name} ${secretProblem(text)}`);
    for (const pattern of SECRET_PATTERNS) assert.doesNotMatch(text, pattern, `${name} có chuỗi giống bí mật Creem (${pattern})`);
  }
  // Mẫu bắt được bí mật thật (kiểm trong bộ nhớ): dán khóa vào chú thích hay vars thì đỏ.
  assert.ok(SECRET_PATTERNS[0].test('// "CREEM_API_KEY": "creem_AbCdEf123456"'));
  assert.ok(SECRET_PATTERNS[1].test('"CREEM_WEBHOOK_SECRET": "whsec_AbCdEf123456"'));
  // Khóa sandbox `creem_test_…` và khóa production có `_` hay `-` bên trong: mẫu chỉ gồm chữ số thuần không bắt được. Mỗi mẫu mới có
  // ít nhất một khóa giả chỉ nó bắt được (`creem_test_AbCdEf12`: mẫu 3; `creem_live_abc-defghijkl_mnop`: mẫu 4), nên bỏ mẫu nào cũng đỏ.
  const fakeKeys = ["creem_test_abcdefghijklmnop1234", "creem_test_AbCdEf12", "creem_live_abc-defghijkl_mnop", "creem_AbCdEf123456"];
  for (const key of fakeKeys) {
    assert.match(secretProblem(JSON.stringify({ vars: { CREEM_API_KEY: key } })), /giống bí mật Creem/, `vars: ${key}`);
    assert.match(secretProblem(`// thử khóa ${key} rồi xóa`), /giống bí mật Creem/, `chú thích: ${key}`);
  }
  assert.match(secretProblem(JSON.stringify({ vars: { CREEM_WEBHOOK_SECRET: "whsec_AbCdEf123456" } })), /giống bí mật Creem/);
  // Tên biến và mô tả không phải bí mật: không báo nhầm.
  const config = { vars: { CREEM_BASE_URL: "https://api.creem.io" }, secrets: { required: ["CREEM_API_KEY", "CREEM_WEBHOOK_SECRET"] } };
  assert.equal(secretProblem(JSON.stringify(config)), null);
  assert.equal(secretProblem("// CREEM_API_KEY: cùng khóa với Worker API; mã sản phẩm Creem (prod_…) của ba gói; sandbox creem-test"), null);
});

test("mã sản phẩm Creem thật (prod_…) chỉ được nằm trong vars.CREEM_PRODUCT_IDS của Worker API: không ở chú thích, không ở Worker admin", () => {
  for (const name of ["wrangler.jsonc", "wrangler.admin.jsonc"]) {
    assert.equal(strayProductIdProblem(raw(name)), null, `${name} ${strayProductIdProblem(raw(name))}`);
  }
  // Luật bắt được lệch (kiểm trong bộ nhớ, không đụng file).
  const ids = '"CREEM_PRODUCT_IDS": { "monthly": "prod_aAbBcCdD1234", "six_months": "prod_eEfFgGhH5678", "yearly": "prod_iIjJkKlL9012" }';
  assert.equal(strayProductIdProblem(`{ "vars": { ${ids} } }`), null, "chỗ được phép: giá trị của CREEM_PRODUCT_IDS");
  assert.match(strayProductIdProblem(`// gói tháng: prod_aAbBcCdD1234\n{ "vars": { ${ids} } }`), /ngoài vars\.CREEM_PRODUCT_IDS/);
  assert.match(strayProductIdProblem(`{ "vars": { "OTHER": "prod_aAbBcCdD1234" } }`), /ngoài vars\.CREEM_PRODUCT_IDS/, "Worker admin không có chỗ nào được phép");
  assert.equal(strayProductIdProblem("// mã sản phẩm Creem (prod_…) của ba gói; prod_ng ngắn"), null, "chú thích nhắc dạng mã không phải mã thật");
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
    "CREEM_API_KEY",
    "CREEM_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "TOKEN_SIGNING_KEY_A",
    "TOKEN_SIGNING_KEY_B",
    "RATE_LIMIT_PEPPER",
  ]);
  for (const name of api.secrets.required) assert.equal(name in api.vars, false, name);
  // Worker admin có khóa API Creem để xem trạng thái đơn, nhưng không có secret webhook (không nhận webhook).
  assert.deepEqual(admin.secrets.required, [
    "PAYOS_CLIENT_ID",
    "PAYOS_API_KEY",
    "PAYOS_CHECKSUM_KEY",
    "CREEM_API_KEY",
    "RESEND_API_KEY",
    "ADMIN_EMAILS",
  ]);
  for (const name of admin.secrets.required) assert.equal(name in admin.vars, false, name);
});

test("runbook docs/release/phat-hanh.md nêu mọi secret bắt buộc của hai Worker (thiếu secret thì wrangler deploy từ chối)", () => {
  const runbook = readFileSync(new URL("../../../docs/release/phat-hanh.md", import.meta.url), "utf8");
  const missing = [...new Set([...api.secrets.required, ...admin.secrets.required])].filter((name) => !runbook.includes(name));
  assert.deepEqual(missing, []);
});

/** Secret Creem bắt buộc của một Worker (tên trong `secrets.required` bắt đầu bằng `CREEM_`). */
function creemSecrets(config) {
  return config.secrets.required.filter((name) => name.startsWith("CREEM_"));
}

/**
 * Một mục của runbook: từ dòng tiêu đề `## <số>.` tới trước tiêu đề `## ` kế tiếp (hay hết file); null nếu không có. Dòng trong
 * các bước của runbook đều thụt lề, nên chỉ tiêu đề mục mới bắt đầu bằng `## ` ở đầu dòng.
 */
function runbookSection(text, number) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## ${number}.`));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n");
}

/** Các lệnh `secret put <TÊN>` trong một đoạn văn bản, kèm cấu hình của `-c` đứng ngay sau tên (null nếu không có `-c`). */
function secretPuts(text) {
  return [...text.matchAll(/secret put ([A-Z][A-Z0-9_]*)(?:[ \t]+-c[ \t]+([\w.-]+))?/g)].map((m) => ({ name: m[1], config: m[2] ?? null }));
}

/** Secret Creem bắt buộc của hai Worker mà các lệnh này chưa đặt đúng dạng (mỗi mục một câu). */
function missingCreemPuts(puts, apiConfig, adminConfig) {
  const has = (name, config) => puts.some((p) => p.name === name && p.config === config);
  return [
    ...creemSecrets(apiConfig).filter((name) => !has(name, null)).map((name) => `thiếu "secret put ${name}" (Worker API, không -c)`),
    ...creemSecrets(adminConfig)
      .filter((name) => !has(name, "wrangler.admin.jsonc"))
      .map((name) => `thiếu "secret put ${name} -c wrangler.admin.jsonc" (Worker admin)`),
  ];
}

/**
 * Lý do các lệnh `secret put` trong một đoạn runbook đặt secret vào nhầm Worker, hay null nếu đúng (M-15). Worker admin: `secret put
 * <TÊN> -c wrangler.admin.jsonc`; Worker API: `secret put <TÊN>`, không `-c`. Mỗi lệnh trong đoạn chỉ đặt secret mà Worker đó đòi
 * (Worker API còn có OPERATOR_EMAIL, tùy chọn), và phải có MỘT khối lệnh (```…```) đặt đủ mọi secret Creem bắt buộc của cả hai Worker
 * (bước Secret): đặt CREEM_WEBHOOK_SECRET cho Worker admin, quên `-c` ở dòng của Worker admin (khóa vào Worker API lần hai, Worker
 * admin thiếu khóa), hay xóa một dòng của bước Secret mà tên vẫn còn ở chỗ khác (lệnh thay khóa ở bước Theo dõi) thì đỏ.
 */
function secretCommandsProblem(section, apiConfig, adminConfig) {
  const puts = secretPuts(section);
  const problems = puts.filter((p) => p.config !== null && p.config !== "wrangler.admin.jsonc").map((p) => `"secret put ${p.name} -c ${p.config}": cấu hình lạ`);
  const apiAllowed = [...apiConfig.secrets.required, "OPERATOR_EMAIL"];
  for (const { name } of puts.filter((p) => p.config === null && !apiAllowed.includes(p.name))) {
    problems.push(`"secret put ${name}" (Worker API) không phải secret của Worker API`);
  }
  for (const { name } of puts.filter((p) => p.config === "wrangler.admin.jsonc" && !adminConfig.secrets.required.includes(p.name))) {
    problems.push(`"secret put ${name} -c wrangler.admin.jsonc" không phải secret của Worker admin`);
  }
  const missing = missingCreemPuts(puts, apiConfig, adminConfig);
  problems.push(...missing);
  const blocks = [...section.matchAll(/```[^\n]*\n([\s\S]*?)\n[ \t]*```/g)].map((m) => m[1]);
  if (missing.length === 0 && !blocks.some((block) => missingCreemPuts(secretPuts(block), apiConfig, adminConfig).length === 0)) {
    problems.push("không có khối lệnh nào đặt đủ secret Creem của cả hai Worker");
  }
  return problems.length > 0 ? problems.join("; ") : null;
}

test("runbook mục 9 (Creem): một khối lệnh đặt đủ secret Creem của hai Worker, đúng Worker (admin có -c wrangler.admin.jsonc, API không -c), xét riêng mục 9", () => {
  const runbook = readFileSync(new URL("../../../docs/release/phat-hanh.md", import.meta.url), "utf8");
  const section = runbookSection(runbook, 9);
  assert.ok(section, "runbook không có mục ## 9.");
  assert.match(section.split("\n")[0], /Creem/, "mục 9 phải là đợt Creem");
  assert.equal(secretCommandsProblem(section, api, admin), null, secretCommandsProblem(section, api, admin) ?? "");
  // Luật bắt được lệch (kiểm trong bộ nhớ, không đụng file).
  const lines = [
    "   pnpm exec wrangler secret put CREEM_API_KEY",
    "   pnpm exec wrangler secret put CREEM_WEBHOOK_SECRET",
    "   pnpm exec wrangler secret put CREEM_API_KEY -c wrangler.admin.jsonc",
  ];
  const fence = (body) => `   \`\`\`bash\n${body}\n   \`\`\``;
  const good = fence(lines.join("\n"));
  assert.equal(secretCommandsProblem(good, api, admin), null);
  assert.match(secretCommandsProblem(good.replace(" -c wrangler.admin.jsonc", ""), api, admin), /thiếu "secret put CREEM_API_KEY -c wrangler\.admin\.jsonc"/);
  assert.match(
    secretCommandsProblem(good.replace("put CREEM_WEBHOOK_SECRET", "put CREEM_WEBHOOK_SECRET -c wrangler.admin.jsonc"), api, admin),
    /CREEM_WEBHOOK_SECRET -c wrangler\.admin\.jsonc" không phải secret của Worker admin.*thiếu "secret put CREEM_WEBHOOK_SECRET"/,
  );
  assert.match(secretCommandsProblem(`${good}\npnpm exec wrangler secret put CREEM_API_KEY -c wrangler.jsonc`, api, admin), /cấu hình lạ/);
  assert.match(secretCommandsProblem(`${good}\npnpm exec wrangler secret put ADMIN_EMAILS`, api, admin), /không phải secret của Worker API/);
  assert.equal(secretCommandsProblem(`${good}\n\`pnpm exec wrangler secret put CREEM_API_KEY -c wrangler.admin.jsonc\` cho cả hai`, api, admin), null);
  // Đủ tên nhưng rải ở nhiều khối (bước Secret mất một dòng, dòng đó chỉ còn ở khối thay khóa): đỏ.
  const scattered = `${fence(lines.slice(0, 2).join("\n"))}\n\n${fence(lines[2])}`;
  assert.match(secretCommandsProblem(scattered, api, admin), /không có khối lệnh nào đặt đủ/);
  assert.match(secretCommandsProblem(lines.join("\n"), api, admin), /không có khối lệnh nào đặt đủ/, "chỉ có trong chữ, không trong khối lệnh");
  // Xét riêng mục 9: lệnh đủ ở mục 4 hay mục sau không bù cho mục 9 thiếu, và mục 9 dừng trước tiêu đề mục kế tiếp.
  const fake = `## 4. Triển khai\n${good}\n\n## 9. Đợt Creem\n${fence(lines[0])}\n\n## 10. Khác\n${good}\n`;
  assert.match(secretCommandsProblem(runbookSection(fake, 9), api, admin), /thiếu "secret put CREEM_WEBHOOK_SECRET"/);
  assert.equal(runbookSection(fake, 9).includes("## 10."), false);
  assert.equal(runbookSection(`## 9. Đợt Creem\n${good}`, 9).endsWith("```"), true, "mục cuối file đọc tới hết file");
  assert.equal(runbookSection("## 1. Một mục\n", 9), null);
});

test("tên miền riêng aitranslator.io.vn (spec 2026-10-06): route, email gửi và origin của Worker admin, tên miền của admin", () => {
  assert.deepEqual(api.routes, [{ pattern: "api.aitranslator.io.vn", custom_domain: true }]);
  for (const config of [api, admin]) {
    assert.equal(config.vars.EMAIL_FROM, "AI Translator <no-reply@mail.aitranslator.io.vn>");
    assert.equal(config.vars.EMAIL_REPLY_TO, "support@aitranslator.io.vn");
  }
  assert.equal(admin.vars.API_ORIGIN, `https://${api.routes[0].pattern}`);
  assert.deepEqual(admin.routes, [{ pattern: "admin.aitranslator.io.vn", custom_domain: true }], "admin chuyển sang tên miền riêng 2026-10-08");
  assert.equal(admin.workers_dev, false, "admin chỉ còn tên miền riêng, workers.dev tắt từ 2026-10-08");
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

test("RELEASES_BASE_URL của Worker admin: https, không có / cuối, và đúng PRODUCTION_URL trong app (spec Hệ thống §2)", () => {
  assert.match(admin.vars.RELEASES_BASE_URL, /^https:\/\/[a-z0-9.-]+$/);
  const source = readFileSync(new URL("../../../src-tauri/src/updater/source.rs", import.meta.url), "utf8");
  const match = /PRODUCTION_URL: Option<&str> = Some\("([^"]+)"\)/.exec(source);
  assert.ok(match, "không tìm thấy PRODUCTION_URL trong source.rs");
  assert.equal(admin.vars.RELEASES_BASE_URL, match[1]);
  assert.equal("RELEASES_BASE_URL" in api.vars, false, "chỉ Worker admin đọc bucket bản phát hành");
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
