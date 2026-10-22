// Kiểm khung trang nhiều ngôn ngữ trong Chrome không đầu (spec 2026-10-22-website-ja-zh-ko §3, §8): menu ngôn ngữ mở, đóng (Esc,
// bấm ra ngoài), trỏ đúng trang; trang chủ mọi ngôn ngữ đã mở không tràn ngang ở 320, 375, 768, 1280 px, sáng và tối.
//   node --test test/layout-i18n.test.mjs        (không có Chrome: bỏ qua)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, launch } from "../tools/browser/cdp.mjs";
import { PUBLISHED, homeOf, tagOf, LANGS } from "../src/langs.mjs";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const DIST = mkdtempSync(join(tmpdir(), "i18n-dist-"));
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

test("menu ngôn ngữ: liệt kê đúng các ngôn ngữ đã mở, mục hiện tại có aria-current; mở rồi đóng bằng Esc và bấm ra ngoài", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 800 });
  await p.goto(base + "/en/pricing/");
  const items = await p.eval(`[...document.querySelectorAll(".lang-pop a")].map((a) => [a.getAttribute("hreflang"), a.getAttribute("href"), a.getAttribute("aria-current")])`);
  assert.deepEqual(items.map((i) => i[0]), PUBLISHED.map(tagOf));
  assert.deepEqual(items.find((i) => i[0] === "vi"), ["vi", "/bang-gia/", null]);
  assert.deepEqual(items.find((i) => i[0] === "en"), ["en", "/en/pricing/", "true"]);
  await p.click(".lang-menu summary");
  assert.equal(await p.eval(`document.querySelector(".lang-menu").open`), true);
  await p.press("Escape");
  assert.equal(await p.eval(`document.querySelector(".lang-menu").open`), false);
  await p.click(".lang-menu summary");
  await p.click("main h1");
  assert.equal(await p.eval(`document.querySelector(".lang-menu").open`), false);
  assert.deepEqual(p.errors, []);
  await p.close();
});

test("trang chủ mọi ngôn ngữ đã mở: không tràn ngang ở 320/375/768/1280 px, sáng và tối; menu ngôn ngữ nằm trong khung", { skip }, async () => {
  const errors = [];
  for (const lang of PUBLISHED) {
    for (const width of [320, 375, 768, 1280]) {
      for (const dark of [false, true]) {
        const p = await browser.newPage({ width, height: 900, mobile: width < 768, dark });
        await p.goto(base + homeOf(lang));
        await p.click(".lang-menu summary");
        await sleep(100);
        const r = await p.eval(`(() => { const pop = document.querySelector(".lang-pop").getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth, inner: innerWidth, popLeft: pop.left, popRight: pop.right, lang: document.documentElement.lang }; })()`);
        if (r.scroll > r.inner) errors.push(`${lang} ${width}px ${dark ? "tối" : "sáng"}: tràn ngang ${r.scroll} > ${r.inner}`);
        if (r.popLeft < 0 || r.popRight > r.inner) errors.push(`${lang} ${width}px: menu ngôn ngữ ra ngoài khung (${r.popLeft}–${r.popRight})`);
        if (r.lang !== LANGS[lang].tag) errors.push(`${lang}: lang="${r.lang}"`);
        errors.push(...p.errors.map((e) => `${lang} ${width}px: ${e}`));
        await p.close();
      }
    }
  }
  assert.deepEqual(errors, []);
});
