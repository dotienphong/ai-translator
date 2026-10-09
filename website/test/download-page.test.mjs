// Kiểm thử hành vi thật của trang Tải xuống (tab hệ điều hành) bằng Chrome không đầu, qua tools/browser/cdp.mjs.
//   node --test test/download-page.test.mjs        (không có Chrome: bỏ qua; đặt CHROME=<đường dẫn> nếu Chrome ở chỗ khác)
// Dựng website vào một thư mục tạm riêng (WEBSITE_DIST) để không đụng bài test dựng chung dist/.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, launch, UA } from "../tools/browser/cdp.mjs";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const DIST = mkdtempSync(join(tmpdir(), "dl-dist-"));
process.env.WEBSITE_DIST = DIST;

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

const PAGES = [
  { lang: "vi", path: "/tai-xuong/", mac: "cai-macos", win: "cai-windows", copy: "Đã chép", mine: "Máy của bạn" },
  { lang: "en", path: "/en/download/", mac: "install-macos", win: "install-windows", copy: "Copied", mine: "Your computer" },
];

/** Mở trang với một thiết bị giả lập; trả về trạng thái các tab để so sánh. */
async function open(page, o = {}, hash = "") {
  const p = await browser.newPage({ width: 1280, height: 900, ...o });
  await p.goto(base + page.path + hash);
  return p;
}
const state = (p) =>
  p.eval(`(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const sel = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    const visible = [...document.querySelectorAll('[role="tabpanel"]')].filter((el) => !el.hidden).map((el) => el.id);
    const chip = document.getElementById("os-detect");
    const note = document.querySelector("[data-note]");
    return {
      selected: sel?.dataset.os ?? null,
      visible,
      badges: tabs.filter((t) => !t.querySelector(".ostab-badge").hidden).map((t) => t.dataset.os),
      chip: chip && !chip.hidden ? chip.textContent : null,
      note: note && !note.hidden ? note.querySelector("[data-note-text]").textContent : null,
      copyLink: Boolean(document.querySelector("[data-copy-link]") && !document.querySelector("[data-copy-link]").hidden),
      tabindex: tabs.map((t) => t.tabIndex),
    };
  })()`);

for (const page of PAGES) {
  test(`${page.lang}: máy Mac mở sẵn tab macOS, đánh dấu máy của bạn, có dòng nhận diện`, { skip }, async () => {
    const p = await open(page, { ua: UA.mac });
    const s = await state(p);
    assert.equal(s.selected, "macos");
    assert.deepEqual(s.visible, [page.mac]);
    assert.deepEqual(s.badges, ["macos"]);
    assert.match(s.chip, /macOS/);
    assert.equal(s.note, null);
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  test(`${page.lang}: máy Windows mở sẵn tab Windows`, { skip }, async () => {
    const p = await open(page, { ua: UA.win });
    const s = await state(p);
    assert.equal(s.selected, "windows");
    assert.deepEqual(s.visible, [page.win]);
    assert.deepEqual(s.badges, ["windows"]);
    assert.match(s.chip, /Windows/);
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  test(`${page.lang}: điện thoại và máy tính bảng thấy lời nhắn mở trang trên máy tính, có nút sao chép liên kết`, { skip }, async () => {
    for (const [name, o] of [
      ["iPhone", { width: 390, height: 844, mobile: true, ua: UA.iphone }],
      ["Android", { width: 390, height: 844, mobile: true, ua: UA.android }],
      ["iPad (giao diện máy tính, có cảm ứng)", { width: 1024, height: 768, mobile: false, touch: true, ua: UA.ipad }],
    ]) {
      const p = await open(page, o);
      const s = await state(p);
      assert.ok(s.note, `${name}: thiếu lời nhắn`);
      assert.equal(s.copyLink, true, `${name}: thiếu nút sao chép liên kết`);
      assert.equal(s.chip, null, `${name}: không được báo "nhận ra máy"`);
      assert.deepEqual(s.badges, [], `${name}: không có tab nào là "máy của bạn"`);
      assert.equal(s.visible.length, 1, `${name}: vẫn hiện đúng một hướng dẫn`);
      assert.deepEqual(p.errors, [], name);
      await p.close();
    }
  });

  test(`${page.lang}: Linux/ChromeOS: báo chưa hỗ trợ, không nút sao chép liên kết, vẫn xem được hướng dẫn`, { skip }, async () => {
    const p = await open(page, { ua: UA.linux });
    const s = await state(p);
    assert.ok(s.note);
    assert.equal(s.copyLink, false);
    assert.deepEqual(s.badges, []);
    assert.equal(s.visible.length, 1);
    await p.close();
  });

  test(`${page.lang}: neo # thắng nhận diện; bấm tab đổi hướng dẫn, đổi URL và được nhớ trong phiên`, { skip }, async () => {
    const p = await open(page, { ua: UA.mac }, `#${page.win}`);
    assert.equal((await state(p)).selected, "windows", "neo #windows phải thắng nhận diện macOS");
    await p.click('[role="tab"][data-os="macos"]');
    let s = await state(p);
    assert.equal(s.selected, "macos");
    assert.deepEqual(s.visible, [page.mac]);
    assert.equal(await p.eval("location.hash"), `#${page.mac}`);
    // Mở lại không có neo: lựa chọn tay trước đó (cùng phiên) thắng nhận diện
    await p.click('[role="tab"][data-os="windows"]');
    await p.eval("history.replaceState(null, '', location.pathname)");
    await p.goto(base + page.path);
    s = await state(p);
    assert.equal(s.selected, "windows", "nhớ lựa chọn tay trong phiên");
    assert.deepEqual(s.badges, ["macos"], "nhãn máy của bạn vẫn theo nhận diện thật");
    assert.deepEqual(p.errors, []);
    await p.close();
  });

  test(`${page.lang}: bàn phím: mũi tên, Home, End đổi tab; chỉ tab đang chọn nằm trong thứ tự Tab`, { skip }, async () => {
    const p = await open(page, { ua: UA.mac });
    await p.focus('[role="tab"][aria-selected="true"]');
    assert.deepEqual((await state(p)).tabindex, [0, -1]);
    await p.press("ArrowRight");
    let s = await state(p);
    assert.equal(s.selected, "windows");
    assert.equal(await p.eval("document.activeElement.dataset.os"), "windows", "tiêu điểm đi theo tab");
    assert.deepEqual(s.tabindex, [-1, 0]);
    await p.press("ArrowRight");
    assert.equal((await state(p)).selected, "macos", "quay vòng");
    await p.press("End");
    assert.equal((await state(p)).selected, "windows");
    await p.press("Home");
    assert.equal((await state(p)).selected, "macos");
    await p.close();
  });

  test(`${page.lang}: nút Sao chép chép đúng lệnh, đổi nhãn rồi trả lại`, { skip }, async () => {
    const p = await open(page, { ua: UA.win });
    await p.eval(`window.__copied = []; navigator.clipboard.writeText = async (t) => { window.__copied.push(t); }`);
    const sel = `#${page.win} .cmd-copy`;
    const label = await p.eval(`document.querySelector(${JSON.stringify(sel)}).querySelector("span").textContent`);
    await p.click(sel);
    assert.deepEqual(await p.eval("window.__copied"), ["irm https://aitranslator.io.vn/install.ps1 | iex"]);
    assert.equal(await p.eval(`document.querySelector(${JSON.stringify(sel)}).querySelector("span").textContent`), page.copy);
    assert.equal(await p.eval(`document.querySelector(${JSON.stringify(sel)}).classList.contains("is-copied")`), true);
    assert.ok(label.length > 0);
    // Nội dung khối lệnh hiển thị đúng bằng nội dung chép (không lẫn dấu nhắc)
    assert.equal(await p.eval(`document.querySelector("#${page.win} .cmd code").textContent`), "irm https://aitranslator.io.vn/install.ps1 | iex");
    await p.click(`#${page.win} [data-copy-link]`).catch(() => {}); // không có nút này trên máy tính: bỏ qua
    await p.close();
  });

  test(`${page.lang}: macOS: lệnh trong khối lệnh đúng, và có ba bước đánh số`, { skip }, async () => {
    const p = await open(page, { ua: UA.mac });
    assert.equal(await p.eval(`document.querySelector("#${page.mac} .cmd code").textContent`), "curl -fsSL https://aitranslator.io.vn/install.sh | bash");
    assert.equal(await p.eval(`document.querySelectorAll("#${page.mac} > .flow > li").length`), 3);
    await p.close();
  });

  test(`${page.lang}: không tràn ngang ở các cỡ màn hình, cả hai tab, sáng và tối`, { skip }, async () => {
    for (const [w, mobile] of [[320, true], [375, true], [768, false], [1280, false]]) {
      for (const dark of [false, true]) {
        const p = await open(page, { width: w, height: 800, mobile, dark, ua: mobile ? UA.android : UA.mac });
        for (const os of ["macos", "windows"]) {
          await p.click(`[role="tab"][data-os="${os}"]`);
          // mở hết các mục xổ xuống trong panel để kiểm cả nội dung bên trong
          await p.eval(`document.querySelectorAll('[role="tabpanel"]:not([hidden]) details').forEach((d) => (d.open = true))`);
          const over = await p.eval(`(() => {
            const w = document.documentElement.clientWidth;
            const bad = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1) && !e.closest("pre, .table-wrap, .cmd, [hidden]") ; });
            return { scroll: document.documentElement.scrollWidth - w, bad: bad.slice(0, 3).map((e) => e.tagName + "." + e.className) };
          })()`);
          assert.ok(over.scroll <= 1, `${page.lang} ${w}px ${dark ? "tối" : "sáng"} ${os}: tràn ngang ${over.scroll}px`);
          assert.deepEqual(over.bad, [], `${page.lang} ${w}px ${os}: phần tử vượt mép phải`);
        }
        assert.deepEqual(p.errors, [], `${page.lang} ${w}px`);
        await p.close();
      }
    }
  });

  test(`${page.lang}: tắt JavaScript: cả hai hướng dẫn hiện đủ, không thanh tab, lệnh vẫn chọn chép được`, { skip }, async () => {
    const p = await browser.newPage({ width: 1280, height: 900, ua: UA.mac });
    await p.setJS(false);
    await p.goto(base + page.path);
    const r = await p.eval(`(() => ({
      panels: [...document.querySelectorAll('[role="tabpanel"]')].map((e) => getComputedStyle(e).display !== "none"),
      list: getComputedStyle(document.querySelector('[role="tablist"]')).display,
      titles: [...document.querySelectorAll(".panel-title")].map((e) => getComputedStyle(e).position),
      copyHidden: [...document.querySelectorAll(".cmd-copy")].every((e) => getComputedStyle(e).display === "none"),
      code: document.querySelectorAll(".cmd code").length,
    }))()`);
    assert.deepEqual(r.panels, [true, true]);
    assert.equal(r.list, "none");
    assert.deepEqual(r.titles, ["static", "static"], "tiêu đề từng hệ điều hành phải hiện khi không có JS");
    assert.equal(r.copyHidden, true);
    assert.ok(r.code >= 2);
    await p.close();
  });
}

for (const page of PAGES) {
  test(`${page.lang}: ở màn hình máy tính, câu hướng dẫn dán lệnh nằm gọn một dòng ở cả hai tab`, { skip }, async () => {
    const p = await open(page, { width: 1280, height: 900, ua: UA.mac });
    for (const os of ["macos", "windows"]) {
      await p.click(`[role="tab"][data-os="${os}"]`);
      const id = os === "macos" ? page.mac : page.win;
      const lines = await p.eval(`(() => {
        const para = document.querySelector("#${id} .flow > li:nth-child(2) .flow-body > p");
        const lh = parseFloat(getComputedStyle(para).lineHeight);
        return Math.round(para.getBoundingClientRect().height / lh);
      })()`);
      assert.equal(lines, 1, `${page.lang} ${os}: câu hướng dẫn dán lệnh bị xuống ${lines} dòng`);
      const width = await p.eval(`Math.round(document.querySelector("#${id}").getBoundingClientRect().width)`);
      assert.ok(width >= 900, `${page.lang} ${os}: khung tab quá hẹp (${width}px)`);
    }
    await p.close();
  });
}

test("neo cũ từ các trang khác (#cai-macos, #cai-windows, #install-macos, #install-windows) đều mở đúng tab", { skip }, async () => {
  for (const page of PAGES) {
    for (const [os, id] of [["macos", page.mac], ["windows", page.win]]) {
      const p = await open(page, { ua: os === "macos" ? UA.win : UA.mac }, `#${id}`);
      const s = await state(p);
      assert.equal(s.selected, os, `${page.path}#${id}`);
      assert.deepEqual(s.visible, [id]);
      await p.close();
    }
  }
});

test("hướng dẫn cài đặt (guide) và các trang khác dùng khối lệnh mới vẫn sao chép được", { skip }, async () => {
  for (const path of ["/huong-dan/cai-dat-macos/", "/huong-dan/cai-dat-windows/", "/en/guide/install-macos/", "/en/guide/install-windows/"]) {
    const p = await browser.newPage({ width: 1280, height: 900, ua: UA.mac });
    await p.goto(base + path);
    await p.eval(`window.__c = []; navigator.clipboard.writeText = async (t) => { window.__c.push(t); }`);
    await p.click(".cmd-copy");
    const got = await p.eval("window.__c");
    assert.equal(got.length, 1, path);
    assert.match(got[0], /install\.(sh|ps1)/, path);
    assert.deepEqual(p.errors, [], path);
    await p.close();
  }
});
