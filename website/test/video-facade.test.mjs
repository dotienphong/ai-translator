// Kiểm nút phát video demo của trang chủ (spec 2026-10-22-website-ja-zh-ko §4) bằng Chrome không đầu, qua tools/browser/cdp.mjs.
//   node --test test/video-facade.test.mjs        (không có Chrome: bỏ qua; đặt CHROME=<đường dẫn> nếu Chrome ở chỗ khác)
// Dựng website vào một thư mục tạm riêng (WEBSITE_DIST) để không đụng bài test dựng chung dist/.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, launch } from "../tools/browser/cdp.mjs";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const DIST = mkdtempSync(join(tmpdir(), "video-dist-"));
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

const state = (p) =>
  p.eval(`(() => {
    const f = document.querySelector("[data-video]");
    const v = f.querySelector("video");
    const b = f.querySelector(".video-play");
    const label = b.querySelector(".video-play-label");
    return {
      facade: f.classList.contains("is-facade"),
      canInvite: f.classList.contains("can-invite"),
      inviting: f.classList.contains("is-inviting"),
      button: !b.hidden && getComputedStyle(b).display !== "none",
      controls: v.controls,
      paused: v.paused,
      readyState: v.readyState,
      labelText: label.textContent,
      labelOpacity: getComputedStyle(label).opacity,
      mp4Fetched: performance.getEntriesByType("resource").some((e) => e.name.includes(".mp4")),
    };
  })()`);
const scrollToVideo = (p) => p.eval(`document.querySelector("[data-video]").scrollIntoView({ block: "center", behavior: "instant" })`);

test("máy tính: nút lớn thay thanh điều khiển; cuộn tới thì mời đúng một lần; chưa tải MP4 trước khi bấm", { skip }, async () => {
  // Cửa sổ thấp (600 px) để lúc mở trang khung video chắc chắn chưa lộ quá nửa dưới phần đầu trang.
  const p = await browser.newPage({ width: 1280, height: 600 });
  await p.goto(base + "/");
  let s = await state(p);
  assert.equal(s.facade, true);
  assert.equal(s.button, true);
  assert.equal(s.controls, false);
  assert.equal(s.canInvite, true);
  assert.equal(s.inviting, false, "chưa cuộn tới mà đã mời");
  assert.match(s.labelText, /^Bấm để xem · \d:\d\d · có tiếng$/);
  await scrollToVideo(p);
  await sleep(500);
  s = await state(p);
  assert.equal(s.inviting, true, "cuộn tới mà không mời");
  // Hai khung cạnh nhau cùng vào màn hình: khung thứ hai cũng được mời.
  assert.equal(await p.eval(`document.querySelectorAll("[data-video]")[1].classList.contains("is-inviting")`), true, "khung video thứ hai không được mời");
  // Chỉ một lần: bỏ lớp, cuộn đi rồi cuộn lại, lớp không được gắn lại.
  await p.eval(`document.querySelector("[data-video]").classList.remove("is-inviting"); scrollTo(0, 0)`);
  await sleep(300);
  await scrollToVideo(p);
  await sleep(500);
  s = await state(p);
  assert.equal(s.inviting, false, "hiệu ứng mời chạy lại lần hai");
  assert.equal(s.readyState, 0);
  assert.equal(s.mp4Fetched, false, "đã tải MP4 trước khi bấm");
  assert.deepEqual(p.errors, []);
  await p.close();
});

test("bấm nút: phát có tiếng, hiện thanh điều khiển gốc, ẩn nút", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 800 });
  await p.goto(base + "/en/");
  await p.click(".video-play");
  await sleep(1500);
  const s = await state(p);
  assert.equal(s.button, false);
  assert.equal(s.facade, false);
  assert.equal(s.controls, true);
  assert.equal(s.paused, false, "video không phát");
  assert.equal(await p.eval(`document.querySelector("[data-video] video").muted`), false);
  assert.deepEqual(p.errors, []);
  await p.close();
});

test("hai video: bấm nút nào phát đúng video đó; phát video này thì video kia tạm dừng", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 800 });
  await p.goto(base + "/en/");
  assert.equal(await p.eval(`document.querySelectorAll("[data-video]").length`), 2);
  const info = (i) =>
    p.eval(`(() => { const v = document.querySelectorAll("[data-video] video")[${i}]; return { paused: v.paused, src: v.currentSrc || v.querySelector("source").src, controls: v.controls }; })()`);
  await p.click(".video-col:nth-child(1) .video-play");
  await sleep(1200);
  let [a, b] = [await info(0), await info(1)];
  assert.equal(a.paused, false, "video họp không phát");
  assert.match(a.src, /ai-translator-meeting\.en\.mp4/);
  assert.equal(b.paused, true);
  assert.equal(b.controls, false, "bấm nút video họp mà video Gõ dịch mất nút phát");
  await p.click(".video-col:nth-child(2) .video-play");
  await sleep(1200);
  [a, b] = [await info(0), await info(1)];
  assert.equal(b.paused, false, "video Gõ dịch không phát");
  assert.match(b.src, /ai-translator-typing\.en\.mp4/);
  assert.equal(a.paused, true, "video họp vẫn phát khi video Gõ dịch bắt đầu");
  assert.deepEqual(p.errors, []);
  await p.close();
});

test("bố cục: 1280 px hai video cạnh nhau cùng cỡ, 375 px xếp dọc và trang không tràn ngang", { skip }, async () => {
  const boxes = (p) =>
    p.eval(`[...document.querySelectorAll("[data-video]")].map((f) => { const r = f.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; })`);
  const wide = await browser.newPage({ width: 1280, height: 800 });
  await wide.goto(base + "/");
  const [l, r] = await boxes(wide);
  assert.equal(l.y, r.y, "hai video không cùng hàng");
  assert.ok(r.x > l.x + l.w - 1, "hai video chồng lên nhau");
  assert.ok(Math.abs(l.w - r.w) <= 1 && Math.abs(l.h - r.h) <= 1, "hai video khác cỡ");
  assert.ok(l.w >= 500, `video quá hẹp: ${l.w} px`);
  await wide.close();
  const narrow = await browser.newPage({ width: 375, height: 800, mobile: true });
  await narrow.goto(base + "/");
  const [t, u] = await boxes(narrow);
  assert.ok(u.y > t.y + t.h - 1, "ở 375 px hai video không xếp dọc");
  assert.equal(t.x, u.x);
  assert.ok(await narrow.eval(`document.documentElement.scrollWidth <= innerWidth`), "trang tràn ngang ở 375 px");
  await narrow.close();
});

test("điện thoại 375 px và máy tính bật giảm chuyển động: nút và nhãn hiện sẵn, không hiệu ứng mời", { skip }, async () => {
  for (const o of [{ width: 375, height: 800, mobile: true }, { width: 1280, height: 800, reduceMotion: true }]) {
    const p = await browser.newPage(o);
    await p.goto(base + "/");
    await scrollToVideo(p);
    await sleep(500);
    const s = await state(p);
    assert.equal(s.button, true, JSON.stringify(o));
    assert.equal(s.canInvite, false, JSON.stringify(o));
    assert.equal(s.inviting, false, JSON.stringify(o));
    assert.equal(s.labelOpacity, "1", JSON.stringify(o));
    await p.close();
  }
});

test("tắt JavaScript: vẫn là <video controls>, không có nút lớn", { skip }, async () => {
  const p = await browser.newPage({ width: 1280, height: 800 });
  await p.setJS(false);
  await p.goto(base + "/");
  const r = await p.eval(`(() => ({ controls: document.querySelector("[data-video] video").controls, display: getComputedStyle(document.querySelector(".video-play")).display }))()`);
  assert.deepEqual(r, { controls: true, display: "none" });
  await p.close();
});
