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
