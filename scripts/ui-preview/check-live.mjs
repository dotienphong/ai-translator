// Kiểm giao diện của "Dịch trong lúc người nói chưa dừng" (spec 2026-10-10 §6, §11; kế hoạch 03, QĐ9) trên trang xem trước
// (vite.config.ts, IPC giả): DOM thật trong Chrome không đầu (qua website/tools/browser/cdp.mjs, không thêm thư viện), cả
// tiếng Việt lẫn tiếng Anh, và ảnh PNG cho người kiểm xem ở target/ui-preview/dich-trong-luc-noi/ (không commit). Điều kiện
// nào sai thì in ra và thoát mã 1.
//
//   node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 &   # trang xem trước, cổng 1431
//   node scripts/ui-preview/check-live.mjs [tên nhóm]                                 # không có tên: mọi nhóm
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../website/tools/browser/cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../target/ui-preview/dich-trong-luc-noi");
const BASE = process.env.PREVIEW_URL ?? "http://127.0.0.1:1431";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

// Chữ của tauri-mock.ts (`LIVE_SAMPLE`): bản dịch của phụ đề tạm số 6 và của bản cuối số 6.
const PROVISIONAL = { vi: "Báo giá của nhà cung cấp đã tới", en: "The vendor's quote has arrived" };
const FINAL = {
  vi: "Chúng ta cũng nên mời nhóm thiết kế tham dự buổi duyệt.",
  en: "We should also invite the design team to the review.",
};

// Biểu thức chạy trong trang: các dòng của thanh phụ đề; độ mờ thật của phần tử đầu tiên khớp `selector`.
const ROWS = `[...document.querySelectorAll(".overlay .lines > .line")]`;
const opacity = (selector) => `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).opacity`;

async function open(browser, url, { width, height, dpr, dark = false, transparent = false }) {
  const page = await browser.newPage({ width, height, dpr, dark });
  if (transparent) {
    await page.s.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  }
  await page.goto(url);
  await sleep(900);
  return page;
}

// Biểu thức `expression` (chạy trong trang) phải ra đúng `true`.
async function check(name, page, expression, what) {
  const value = await page.eval(expression).catch((e) => `lỗi: ${e.message}`);
  if (value !== true) failures.push(`${name}: ${what} (được ${JSON.stringify(value)})`);
}

async function shot(name, page) {
  const r = await page.s.send("Page.captureScreenshot", { format: "png" });
  const file = path.join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  // Chrome tự xin /favicon.ico (trang xem trước không có): bỏ qua lỗi 404 đó.
  failures.push(...page.errors.filter((e) => !e.includes("status of 404")).map((e) => `${name}: ${e}`));
  page.errors.length = 0;
  console.log(file);
}

const SUITES = {
  // Thanh phụ đề (spec 2026-10-10 §6.1): dòng đang nói sau dòng cuối, nối tiếp câu đang ghép, bản cuối thay vào, phụ đề tạm.
  async overlay(browser, lang) {
    const url = (q) => `${BASE}/overlay.html?session=running&${q}&lang=${lang}`;
    const size = { width: 900, height: 300, dpr: 2, transparent: true };

    let page = await open(browser, url("live=alone"), size);
    let name = `overlay-alone.${lang}`;
    await check(name, page, `${ROWS}.length === 6`, "5 câu mẫu và 1 dòng đang nói");
    await check(name, page, `${ROWS}.at(-1).classList.contains("live")`, "dòng đang nói nằm sau dòng cuối");
    await check(name, page, `${opacity(".overlay .live .main .tail")} === "0.65"`, "phần tạm của bản dịch nhạt 0,65");
    await check(name, page, `${opacity(".overlay .live .main")} === "1"`, "phần ổn định giữ độ đậm bình thường");
    await check(name, page, `document.querySelector(".overlay .live .source .tail") !== null`, "câu gốc cũng hai tầng");
    await shot(name, page);
    await page.close();

    page = await open(browser, url("live=extends"), size);
    name = `overlay-extends.${lang}`;
    await check(name, page, `document.querySelectorAll(".overlay .live").length === 1`, "một dòng đang nói");
    await check(name, page, `${ROWS}.length === 6`, "dòng đang nói thay chỗ phụ đề tạm số 6, không thêm dòng");
    await check(name, page, `${ROWS}.at(-1).classList.contains("live")`, "dòng đang nói ở chỗ của phụ đề số 6");
    await check(
      name,
      page,
      `${ROWS}.every((r) => r.querySelector(".main").textContent !== ${JSON.stringify(PROVISIONAL[lang])})`,
      "phụ đề tạm số 6 tạm ẩn",
    );
    await shot(name, page);
    await page.close();

    page = await open(browser, url("live=final"), size);
    name = `overlay-final.${lang}`;
    await check(name, page, `${ROWS}.at(-1).classList.contains("live")`, "trước: dòng đang nói");
    await shot(`overlay-final-truoc.${lang}`, page);
    await page.eval("window.__livePreview.finish()");
    await sleep(200);
    await check(name, page, `document.querySelector(".overlay .live") === null`, "sau: dòng đang nói đã gỡ");
    await check(name, page, `${ROWS}.length === 6`, "bản cuối nằm đúng chỗ dòng đang nói, không thêm dòng");
    await check(
      name,
      page,
      `${ROWS}.at(-1).querySelector(".main").textContent === ${JSON.stringify(FINAL[lang])}`,
      "bản cuối thay vào",
    );
    await shot(`overlay-final-sau.${lang}`, page);
    await page.close();

    for (const slow of [false, true]) {
      page = await open(browser, url(`live=provisional${slow ? "&slow=1" : ""}`), size);
      name = `overlay-provisional${slow ? "-slow" : ""}.${lang}`;
      const last = `${ROWS}.at(-1)`;
      await check(
        name,
        page,
        `${last}.classList.contains("provisional") === ${slow}`,
        slow ? "máy chưa đủ nhanh: phụ đề tạm nhạt cả dòng" : "đang dịch trong lúc nói: phụ đề tạm không nhạt cả dòng",
      );
      await check(name, page, `getComputedStyle(${last}).opacity === ${JSON.stringify(slow ? "0.65" : "1")}`, "độ mờ của dòng");
      await shot(name, page);
      await page.close();
    }
  },

  // Cài đặt › Phụ đề (spec 2026-10-10 §6.3): công tắc, ghi chú máy chưa đủ nhanh, khung xem trước hai tầng.
  async settings(browser, lang) {
    const NOTE = {
      vi: "Máy này chưa đủ nhanh, app đang dịch sau mỗi câu.",
      en: "This computer isn't fast enough, so the app translates after each sentence.",
    };
    const url = (q) => `${BASE}/?screen=settings&group=subtitles${q}&lang=${lang}`;
    const size = { width: 960, height: 640, dpr: 1.5 };
    const SWITCH = `document.querySelector("#translate-while-speaking")`;
    const TAILS = `document.querySelectorAll(".subtitle-preview .tail").length`;
    const NOTE_TEXT = `(document.querySelector(".field-note")?.textContent ?? null)`;

    let page = await open(browser, url(""), size);
    let name = `settings-on.${lang}`;
    await check(name, page, `${SWITCH}.checked === true`, "công tắc mặc định bật");
    await check(name, page, `${TAILS} === 2`, "khung xem trước: câu gốc và bản dịch đều hai tầng");
    await check(name, page, `${opacity(".subtitle-preview .tail")} === "0.65"`, "phần tạm nhạt 0,65");
    await check(name, page, `${NOTE_TEXT} === null`, "máy đủ nhanh: không có ghi chú");
    await shot(name, page);
    await page.click("#translate-while-speaking");
    await sleep(300);
    name = `settings-off.${lang}`;
    await check(name, page, `${SWITCH}.checked === false`, "bấm công tắc thì tắt");
    await check(name, page, `${TAILS} === 0`, "tắt thì khung xem trước là câu mẫu thường");
    await shot(name, page);
    await page.close();

    page = await open(browser, url("&slow=1"), size);
    name = `settings-slow.${lang}`;
    await check(name, page, `${NOTE_TEXT} === ${JSON.stringify(NOTE[lang])}`, "ghi chú máy chưa đủ nhanh, đúng chữ của spec");
    await check(name, page, `${TAILS} === 0`, "máy chưa đủ nhanh: khung xem trước là câu mẫu thường");
    await shot(name, page);
    await page.close();

    page = await open(browser, url("&slow=1&tws=0"), size);
    name = `settings-slow-off.${lang}`;
    await check(name, page, `${SWITCH}.checked === false && ${NOTE_TEXT} === null`, "tắt công tắc thì không ghi chú");
    await page.close();

    page = await open(browser, url("&theme=dark"), { ...size, dark: true });
    name = `settings-on.dark.${lang}`;
    await check(name, page, `${TAILS} === 2`, "giao diện tối: mẫu hai tầng");
    await shot(name, page);
    await page.close();

    page = await open(browser, url("&slow=1&theme=dark"), { ...size, dark: true });
    name = `settings-slow.dark.${lang}`;
    await check(name, page, `${NOTE_TEXT} === ${JSON.stringify(NOTE[lang])}`, "giao diện tối: ghi chú");
    await shot(name, page);
    await page.close();
  },
};

const only = process.argv[2];
const suites = Object.entries(SUITES).filter(([n]) => !only || n === only);
if (suites.length === 0) throw new Error(`không có nhóm kiểm ${only}`);
mkdirSync(out, { recursive: true });
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");
try {
  for (const lang of ["vi", "en"]) for (const [, run] of suites) await run(browser, lang);
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("check-live: đạt");
}
