// Kiểm khối tab "Tính năng chính" của trang chủ (spec 2026-10-27-trang-chu-ba-viec-tab-design) bằng Chrome không đầu, qua tools/browser/cdp.mjs.
//   node --test test/feature-tabs.test.mjs        (không có Chrome: bỏ qua; đặt CHROME=<đường dẫn> nếu Chrome ở chỗ khác)
// Dựng website vào một thư mục tạm riêng (WEBSITE_DIST) để không đụng bài test dựng chung dist/. Việc video tạm dừng khi chuyển tab
// nằm ở test/video-facade.test.mjs (cần bấm phát thật).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, launch } from "../tools/browser/cdp.mjs";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const DIST = mkdtempSync(join(tmpdir(), "ftabs-dist-"));
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

const EN_IDS = ["meeting-translation", "type-and-translate", "history"];
const PAGES = [
  { lang: "vi", path: "/", ids: ["dich-cuoc-hop", "go-dich", "lich-su"], tabs: ["Dịch họp", "Gõ dịch", "Lịch sử"] },
  { lang: "en", path: "/en/", ids: EN_IDS, tabs: ["Meetings", "Type & Translate", "History"] },
  { lang: "ja", path: "/ja/", ids: EN_IDS, tabs: ["会議の翻訳", "入力翻訳", "履歴"] },
  { lang: "zh", path: "/zh/", ids: EN_IDS, tabs: ["会议翻译", "输入翻译", "历史记录"] },
  { lang: "ko", path: "/ko/", ids: EN_IDS, tabs: ["회의 번역", "입력 번역", "기록"] },
];

const state = (p) =>
  p.eval(`(() => {
    const tabs = [...document.querySelectorAll('[data-ftabs] [role="tab"]')];
    const panels = [...document.querySelectorAll('[data-ftabs] [role="tabpanel"]')];
    return {
      labels: tabs.map((t) => t.textContent.trim()),
      selected: tabs.filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.getAttribute("aria-controls")),
      visible: panels.filter((el) => getComputedStyle(el).display !== "none").map((el) => el.id),
      tabindex: tabs.map((t) => t.tabIndex),
      list: getComputedStyle(document.querySelector('[data-ftabs] [role="tablist"]')).display,
    };
  })()`);

for (const page of PAGES) {
  test(`${page.lang}: ba tab đủ nhãn; tab đầu mở sẵn, chỉ panel đầu hiện, chỉ tab đang chọn nằm trong thứ tự Tab`, { skip }, async () => {
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.goto(base + page.path);
    const s = await state(p);
    assert.deepEqual(s.labels, page.tabs);
    assert.deepEqual(s.selected, [page.ids[0]]);
    assert.deepEqual(s.visible, [page.ids[0]]);
    assert.deepEqual(s.tabindex, [0, -1, -1]);
    assert.notEqual(s.list, "none", "thanh tab phải hiện khi có JS");
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  test(`${page.lang}: bấm tab đổi panel và URL; ảnh, video trong panel vừa mở hiện rõ (không kẹt opacity 0)`, { skip }, async () => {
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.goto(base + page.path);
    for (const id of [page.ids[1], page.ids[2], page.ids[0]]) {
      await p.click(`[role="tab"][aria-controls="${id}"]`);
      const s = await state(p);
      assert.deepEqual(s.visible, [id]);
      assert.deepEqual(s.selected, [id]);
      assert.equal(await p.eval("location.hash"), `#${id}`);
      await sleep(400);
      const opacity = await p.eval(`[...document.querySelectorAll("#${id} .reveal")].map((e) => getComputedStyle(e).opacity)`);
      assert.ok(opacity.length > 0 && opacity.every((o) => o === "1"), `${page.lang} ${id}: opacity ${opacity}`);
    }
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  test(`${page.lang}: neo # mở đúng tab ngay khi vào trang, và đổi neo thì đổi tab`, { skip }, async () => {
    for (const id of page.ids) {
      const p = await browser.newPage({ width: 1280, height: 900 });
      await p.goto(base + page.path + `#${id}`);
      const s = await state(p);
      assert.deepEqual(s.visible, [id], `${page.path}#${id}`);
      assert.deepEqual(s.selected, [id]);
      // Hồi quy (sửa ở 53464c8f): cuộn tới neo phải dừng với thanh tab ngay dưới header dính (khoảng header + 16 px),
      // không để thanh tab khuất dưới header.
      await sleep(400);
      const top = await p.eval(`document.querySelector('[data-ftabs] [role="tablist"]').getBoundingClientRect().top`);
      const header = await p.eval(`document.querySelector(".site-header").getBoundingClientRect().height`);
      assert.ok(top >= header - 1, `${page.lang} #${id}: thanh tab nằm dưới header (top ${top}, header ${header})`);
      assert.ok(top <= header + 60, `${page.lang} #${id}: thanh tab lệch quá xa header (top ${top})`);
      await p.close();
    }
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.goto(base + page.path);
    await p.eval(`location.hash = "#${page.ids[2]}"`);
    await sleep(200);
    assert.deepEqual((await state(p)).visible, [page.ids[2]], "đổi neo # phải đổi tab");
    await p.eval(`location.hash = "#khong-co-tab-nay"`);
    await sleep(200);
    assert.deepEqual((await state(p)).visible, [page.ids[2]], "neo lạ không được đổi tab");
    await p.close();
  });

  test(`${page.lang}: khối tab không tràn ngang ở các cỡ màn hình, ba tab, sáng và tối`, { skip }, async () => {
    for (const [w, mobile] of [[320, true], [375, true], [768, false], [1280, false]]) {
      for (const dark of [false, true]) {
        const p = await browser.newPage({ width: w, height: 800, mobile, dark });
        await p.goto(base + page.path);
        for (const id of page.ids) {
          await p.click(`[role="tab"][aria-controls="${id}"]`);
          const over = await p.eval(`(() => {
            const w = document.documentElement.clientWidth;
            const bad = [...document.querySelectorAll("[data-ftabs] *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1; });
            return { scroll: document.documentElement.scrollWidth - w, bad: bad.slice(0, 3).map((e) => e.tagName + "." + e.className) };
          })()`);
          const where = `${page.lang} ${w}px ${dark ? "tối" : "sáng"} ${id}`;
          assert.deepEqual(over.bad, [], `${where}: phần tử vượt mép phải`);
          if (w >= 375) assert.ok(over.scroll <= 1, `${where}: trang tràn ngang ${over.scroll}px`);
        }
        assert.deepEqual(p.errors, [], `${page.lang} ${w}px`);
        await p.close();
      }
    }
  });

  test(`${page.lang}: tắt JavaScript: cả ba panel hiện nối nhau với h3, không thanh tab, video vẫn có thanh điều khiển`, { skip }, async () => {
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.setJS(false);
    await p.goto(base + page.path);
    const r = await p.eval(`(() => ({
      panels: [...document.querySelectorAll('[data-ftabs] [role="tabpanel"]')].map((e) => getComputedStyle(e).display !== "none"),
      titles: [...document.querySelectorAll('[data-ftabs] [role="tabpanel"] h3')].map((e) => getComputedStyle(e).display !== "none"),
      list: getComputedStyle(document.querySelector('[data-ftabs] [role="tablist"]')).display,
      videos: [...document.querySelectorAll("[data-ftabs] video")].map((v) => v.controls),
    }))()`);
    assert.deepEqual(r.panels, [true, true, true]);
    assert.deepEqual(r.titles, [true, true, true]);
    assert.equal(r.list, "none");
    assert.deepEqual(r.videos, [true, true]);
    await p.close();
  });
}

for (const page of PAGES.slice(0, 2)) {
  test(`${page.lang}: bàn phím: mũi tên, Home, End đổi tab (quay vòng), tiêu điểm đi theo tab`, { skip }, async () => {
    const p = await browser.newPage({ width: 1280, height: 900 });
    await p.goto(base + page.path);
    await p.focus('[data-ftabs] [role="tab"][aria-selected="true"]');
    const focused = () => p.eval(`document.activeElement.getAttribute("aria-controls")`);
    await p.press("ArrowRight");
    assert.deepEqual((await state(p)).selected, [page.ids[1]]);
    assert.equal(await focused(), page.ids[1], "tiêu điểm đi theo tab");
    assert.deepEqual((await state(p)).tabindex, [-1, 0, -1]);
    await p.press("End");
    assert.deepEqual((await state(p)).selected, [page.ids[2]]);
    await p.press("ArrowRight");
    assert.deepEqual((await state(p)).selected, [page.ids[0]], "quay vòng về tab đầu");
    await p.press("ArrowLeft");
    assert.deepEqual((await state(p)).selected, [page.ids[2]], "quay vòng về tab cuối");
    await p.press("Home");
    assert.deepEqual((await state(p)).selected, [page.ids[0]]);
    await p.close();
  });
}
