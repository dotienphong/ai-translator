// Thanh đồng ý và Google Analytics trong Chrome không đầu (chính sách quyền riêng tư 1.9, mục 14), qua tools/browser/cdp.mjs.
// Mọi request tới Google bị chặn bằng Fetch domain và ghi lại, nên test không chạm mạng thật. CSP của trang vẫn áp như thật.
//   node --test test/consent.test.mjs        (không có Chrome: bỏ qua; đặt CHROME=<đường dẫn> nếu Chrome ở chỗ khác)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, launch } from "../tools/browser/cdp.mjs";
import { CONSENT } from "../src/consent.mjs";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const DIST = mkdtempSync(join(tmpdir(), "consent-dist-"));
process.env.WEBSITE_DIST = DIST;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let browser;
let base;

before(async () => {
  if (skip) return;
  const { build } = await import("../src/build/build.mjs");
  await build();
  const { start } = await import("../src/serve.mjs");
  server = await start(0);
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await launch();
});

after(async () => {
  await browser?.close();
  server?.close();
  rmSync(DIST, { recursive: true, force: true });
});

/** Trang mới, localStorage sạch, mọi request tới Google được ghi vào `google` và trả rỗng. */
async function freshPage(path = "/", o = {}) {
  const p = await browser.newPage({ width: 1280, height: 900, ...o });
  const google = [];
  p.s.handlers.push((m) => {
    if (m.method !== "Fetch.requestPaused") return;
    google.push(m.params.request.url);
    p.s.send("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/javascript" }], body: "" });
  });
  await p.s.send("Fetch.enable", { patterns: [{ urlPattern: "https://www.googletagmanager.com/*" }, { urlPattern: "https://*.google-analytics.com/*" }, { urlPattern: "https://*.analytics.google.com/*" }] });
  await p.goto(base + "/");
  await p.eval("localStorage.clear()");
  await p.goto(base + path);
  return { p, google };
}
const bar = (p) => p.eval(`!!document.querySelector(".consent-bar")`);
const choice = (p) => p.eval(`localStorage.getItem("ga-consent")`);
const gtagScripts = (p) => p.eval(`document.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js?id=G-HSYP3R60BB"]').length`);
const clickButton = (p, label) => p.eval(`(() => { const b = [...document.querySelectorAll(".consent-bar button")].find((x) => x.textContent === ${JSON.stringify(label)}); b.click(); return true; })()`);

test("lần vào đầu: hiện thanh đồng ý, chưa tải gì của Google, không cookie", { skip }, async () => {
  const { p, google } = await freshPage("/");
  assert.equal(await bar(p), true);
  assert.equal(await choice(p), null);
  assert.deepEqual(google, []);
  assert.equal(await gtagScripts(p), 0);
  assert.equal(await p.eval(`document.cookie`), "");
  assert.equal(await p.eval(`document.querySelector(".consent-bar").textContent.includes(${JSON.stringify(CONSENT.vi.text)})`), true);
  assert.equal(await p.eval(`document.querySelector(".consent-bar a").getAttribute("href")`), "/chinh-sach-quyen-rieng-tu/");
  assert.deepEqual(p.errors.filter((e) => /Content Security|CSP|Refused/i.test(e)), []);
  await p.close();
});

test("Từ chối: thanh biến mất, không tải Google, lần sau không hỏi lại; Cài đặt cookie hỏi lại được", { skip }, async () => {
  const { p, google } = await freshPage("/");
  await clickButton(p, CONSENT.vi.decline);
  assert.equal(await bar(p), false);
  assert.equal(await choice(p), "denied");
  await p.goto(base + "/bang-gia/");
  assert.equal(await bar(p), false);
  assert.deepEqual(google, []);
  assert.equal(await gtagScripts(p), 0);
  await p.click("[data-consent-open]");
  assert.equal(await bar(p), true);
  await p.close();
});

test("Đồng ý: tải gtag.js đúng mã đo lường, tắt tín hiệu quảng cáo, lần sau tải ngay không hỏi; Từ chối lại thì xóa cookie _ga", { skip }, async () => {
  const { p, google } = await freshPage("/");
  await clickButton(p, CONSENT.vi.accept);
  assert.equal(await choice(p), "granted");
  assert.equal(await bar(p), false);
  assert.equal(await gtagScripts(p), 1);
  assert.ok(google.some((u) => u.startsWith("https://www.googletagmanager.com/gtag/js?id=G-HSYP3R60BB")), google.join(", "));
  const config = await p.eval(`[...window.dataLayer].map((a) => Array.from(a)).find((a) => a[0] === "config")`);
  assert.deepEqual(config, ["config", "G-HSYP3R60BB", { allow_google_signals: false, allow_ad_personalization_signals: false }]);
  // Trang sau: đã đồng ý thì tải ngay, không hiện thanh.
  await p.goto(base + "/bang-gia/");
  assert.equal(await bar(p), false);
  assert.equal(await gtagScripts(p), 1);
  // Đổi ý: đặt cookie giả như GA đặt, từ chối thì bị xóa.
  await p.eval(`document.cookie = "_ga=GA1.1.1.1; path=/"; document.cookie = "_ga_HSYP3R60BB=x; path=/"; true`);
  await p.click("[data-consent-open]");
  await clickButton(p, CONSENT.vi.decline);
  assert.equal(await choice(p), "denied");
  assert.equal(await p.eval(`document.cookie`), "");
  assert.equal(await p.eval(`window["ga-disable-G-HSYP3R60BB"]`), true);
  await p.close();
});

test("tiếng Anh dùng chữ tiếng Anh và dẫn tới /en/privacy/; thanh không che bong bóng chat ở 375 px", { skip }, async () => {
  const en = await freshPage("/en/");
  assert.equal(await en.p.eval(`document.querySelector(".consent-bar button.btn-primary").textContent`), CONSENT.en.accept);
  assert.equal(await en.p.eval(`document.querySelector(".consent-bar a").getAttribute("href")`), "/en/privacy/");
  await en.p.close();
  const m = await freshPage("/", { width: 375, height: 800 });
  const overlap = await m.p.eval(`(() => { const a = document.querySelector(".consent-bar").getBoundingClientRect(); const b = document.querySelector(".chat-bubble").getBoundingClientRect(); return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom; })()`);
  assert.equal(overlap, false);
  assert.equal(await m.p.eval(`document.documentElement.scrollWidth <= innerWidth`), true);
  await m.p.close();
});

test("tắt JavaScript: không có thanh, không có cookie, nút Cài đặt cookie vẫn ẩn", { skip }, async () => {
  const { p, google } = await freshPage("/");
  await p.setJS(false);
  await p.goto(base + "/");
  assert.equal(await bar(p), false);
  assert.equal(await p.eval(`document.querySelector("[data-consent-open]").hidden`), true);
  assert.deepEqual(google, []);
  await p.close();
});
