// Worker chuyển hướng (spec 2026-10-23-ten-mien-aitranslator-vn §2.3): bốn tên → tên chính thức, 301, giữ đường dẫn và query.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker, { TARGETS } from "../src/redirect.mjs";

const go = (url, method = "GET") => worker.fetch(new Request(url, { method }));
const jsonc = async (file) => JSON.parse((await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(/^\s*\/\/.*$/gm, ""));

test("tên cũ và www về aitranslator.vn, giữ đường dẫn và query, mọi phương thức", async () => {
  for (const host of ["aitranslator.io.vn", "www.aitranslator.io.vn", "www.aitranslator.vn"]) {
    for (const method of ["GET", "HEAD", "POST"]) {
      const r = await go(`https://${host}/tai-xuong/?a=1&b=2`, method);
      assert.equal(r.status, 301, `${method} ${host}`);
      assert.equal(r.headers.get("location"), "https://aitranslator.vn/tai-xuong/?a=1&b=2");
      assert.equal(r.headers.get("cache-control"), "public, max-age=3600");
    }
  }
  // Lệnh cài cũ (`curl -fsSL https://aitranslator.io.vn/install.sh | bash`, `irm …/install.ps1 | iex`) theo chuyển hướng tới script mới.
  assert.equal((await go("https://aitranslator.io.vn/install.sh")).headers.get("location"), "https://aitranslator.vn/install.sh");
  assert.equal((await go("https://aitranslator.io.vn/install.ps1")).headers.get("location"), "https://aitranslator.vn/install.ps1");
  assert.equal((await go("http://aitranslator.io.vn")).headers.get("location"), "https://aitranslator.vn/");
});

test("admin cũ về admin.aitranslator.vn", async () => {
  const r = await go("https://admin.aitranslator.io.vn/orders?q=1");
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "https://admin.aitranslator.vn/orders?q=1");
});

test("tên lạ trả 404, không chuyển hướng mở", async () => {
  // api. và releases. của tên cũ chạy song song cho app cũ, không bao giờ tới Worker này; nếu tới thì cũng không chuyển hướng.
  for (const url of ["https://evil.example/x", "https://api.aitranslator.io.vn/v1/health", "https://aitranslator.vn/", "https://toString/"]) {
    const r = await go(url);
    assert.equal(r.status, 404, url);
    assert.equal(r.headers.get("location"), null);
  }
});

test("cấu hình wrangler gắn đúng các tên của bảng, và site chỉ còn tên chính thức", async () => {
  const redirect = await jsonc("wrangler.redirect.jsonc");
  const site = await jsonc("wrangler.jsonc");
  assert.equal(redirect.name, "ai-translator-redirect");
  assert.equal(redirect.main, "src/redirect.mjs");
  assert.deepEqual(redirect.routes.map((r) => r.pattern).sort(), Object.keys(TARGETS).sort());
  assert.ok(redirect.routes.every((r) => r.custom_domain === true));
  assert.equal(redirect.workers_dev, false);
  assert.equal(redirect.preview_urls, false);
  assert.deepEqual(site.routes, [{ pattern: "aitranslator.vn", custom_domain: true }]);
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.deploy, /wrangler deploy && wrangler deploy -c wrangler\.redirect\.jsonc/, "site trước, chuyển hướng sau");
});
