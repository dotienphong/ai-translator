// Kiểm giao diện app ở các ngôn ngữ giao diện (spec 2026-10-12-ui-ja-zh-ko-design.md §7) trên trang xem trước
// (vite.config.ts, IPC giả): DOM thật trong Chrome không đầu (qua website/tools/browser/cdp.mjs, không thêm thư viện), ở
// cỡ cửa sổ mặc định (960×640) và nhỏ nhất (720×480). Với mỗi màn hình: thuộc tính <html lang> đúng; trang không cuộn ngang;
// chữ của nút, nhãn, tiêu đề không tràn khỏi ô; ô chọn ngôn ngữ có đủ 5 mục. Ảnh PNG cho người kiểm xem ở
// target/ui-preview/ui-ja-zh-ko/ (không commit). Điều kiện nào sai thì in ra và thoát mã 1.
//
//   node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 &   # trang xem trước, cổng 1431
//   node scripts/ui-preview/check-i18n.mjs [mã ngôn ngữ…]                            # không có mã: ja zh ko
//
// Chạy thử với `vi en` trước để biết lỗi có sẵn (không do ngôn ngữ mới): chỉ sửa lỗi riêng của ja, zh, ko.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../website/tools/browser/cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../target/ui-preview/ui-ja-zh-ko");
const BASE = process.env.PREVIEW_URL ?? "http://127.0.0.1:1431";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

const args = process.argv.slice(2);
const LANGS = args.length > 0 ? args : ["ja", "zh", "ko"];
// Giá trị `lang` của trang theo ngôn ngữ giao diện (`htmlLang` ở src/i18n/index.ts) và thứ tự `UI_LANGUAGES`.
const HTML_LANG = { vi: "vi", en: "en", ja: "ja", zh: "zh-Hans", ko: "ko" };
const UI_ORDER = ["vi", "en", "ja", "zh", "ko"];

const WINDOWS = [
  { name: "960x640", width: 960, height: 640 },
  { name: "720x480", width: 720, height: 480 },
];

// [tên, tham số URL, tùy chọn { prepare: biểu thức chạy trước khi kiểm, wait: ms }]
const SCREENS = [
  ["home", "screen=home"],
  ["home-running", "screen=home&session=running"],
  ["home-dark", "screen=home&theme=dark"],
  ["home-notice-update", "screen=home&notice=update"],
  ["home-notice-hotkeys", "screen=home&notice=hotkeys"],
  ["transcript", "screen=transcript"],
  ["history", "screen=history"],
  ["glossary", "screen=glossary"],
  ["settings-general", "screen=settings&group=general"],
  ["settings-subtitles", "screen=settings&group=subtitles"],
  ["settings-subtitles-dark", "screen=settings&group=subtitles&theme=dark"],
  ["settings-audio", "screen=settings&group=audio"],
  ["settings-model", "screen=settings&group=model"],
  ["settings-hotkeys", "screen=settings&group=hotkeys"],
  ["settings-license", "screen=settings&group=license"],
  ["settings-privacy", "screen=settings&group=privacy"],
  ["upgrade", "screen=upgrade&plan=free"],
  ["upgrade-qr", "screen=upgrade&plan=free&checkout=1"],
  ["about", "screen=about"],
  ["onboarding-1", "onboarding=1"],
  // Bước điều khoản: mở khung EULA để thấy dòng báo "văn bản đang bằng English" của ja, zh, ko.
  [
    "onboarding-2",
    "onboarding=2",
    { prepare: `document.querySelector("details.legal-details summary").click()`, wait: 900 },
  ],
  ...Array.from({ length: 7 }, (_, i) => [`onboarding-${i + 3}`, `onboarding=${i + 3}${i === 1 ? "&download=1" : ""}`]),
];
const OVERLAYS = [
  ["overlay", "session=running"],
  ["overlay-live", "session=running&live=alone"],
];

// Phần tử có chữ tràn khỏi ô: tối đa 8, mỗi phần tử một dòng mô tả. Dấu "…" có chủ ý (text-overflow: ellipsis) không tính.
const AUDIT = `(() => {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.push("trang cuộn ngang " + de.scrollWidth + " > " + de.clientWidth);
  const boxes = [...document.querySelectorAll("button, summary, label, th, td, option, .choice-title, h1, h2, h3, h4")];
  for (const el of boxes) {
    // Bỏ phần tử ẩn có chủ ý (.sr-only rộng 1 px, dành cho trình đọc màn hình).
    if (el.clientWidth <= 2) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.textOverflow === "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      out.push("chữ tràn khỏi ô: " + el.tagName.toLowerCase() + " " + JSON.stringify((el.textContent || "").trim().slice(0, 40)));
    }
  }
  return out.slice(0, 8);
})()`;

// Điều kiện riêng của từng màn hình: [biểu thức phải ra true, mô tả].
const EXTRA = {
  "settings-general": (lang) => [
    `(() => { const s = document.querySelector("#ui-language"); return !!s && s.options.length === 5 && s.value === ${JSON.stringify(lang)}; })()`,
    "ô chọn ngôn ngữ giao diện có đủ 5 mục và chọn đúng ngôn ngữ",
  ],
  "onboarding-1": (lang) => [
    `(() => { const r = [...document.querySelectorAll('input[name="ui-language"]')]; return r.length === 5 && r.filter((x) => x.checked).length === 1 && r[${UI_ORDER.indexOf(lang)}].checked; })()`,
    "bước 1 có 5 ô chọn và chọn sẵn đúng ngôn ngữ",
  ],
  "onboarding-2": (lang) => {
    const note = ["ja", "zh", "ko"].includes(lang);
    return [
      note
        ? `(() => { const p = document.querySelector(".legal p.hint"); return !!p && p.textContent.includes("English"); })()`
        : `!document.querySelector(".legal p.hint")`,
      note ? "khung EULA có dòng báo văn bản đang bằng English" : "khung EULA không có dòng báo (có bản đúng ngôn ngữ)",
    ];
  },
};

async function check(label, page, expression, what) {
  const value = await page.eval(expression).catch((e) => `lỗi: ${e.message}`);
  if (value !== true) failures.push(`${label}: ${what} (được ${JSON.stringify(value)})`);
}

async function visit(browser, lang, win, name, url, { prepare, wait = 700, transparent = false, audit = true } = {}, extra) {
  const label = `${lang}/${win.name}/${name}`;
  const page = await browser.newPage({ width: win.width, height: win.height, dpr: 1 });
  if (transparent) await page.s.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await page.goto(url);
  await sleep(800);
  if (prepare) {
    await page.eval(prepare);
    await sleep(wait);
  }
  await check(label, page, `document.documentElement.lang === ${JSON.stringify(HTML_LANG[lang])}`, `<html lang> phải là ${HTML_LANG[lang]}`);
  if (audit) {
    const issues = await page.eval(AUDIT).catch((e) => [`lỗi: ${e.message}`]);
    for (const issue of issues) failures.push(`${label}: ${issue}`);
  }
  if (extra) await check(label, page, extra[0], extra[1]);
  const shot = await page.s.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(out, `${lang}.${win.name}.${name}.png`), Buffer.from(shot.data, "base64"));
  // Chrome tự xin /favicon.ico (trang xem trước không có): bỏ qua lỗi 404 đó.
  failures.push(...page.errors.filter((e) => !e.includes("status of 404")).map((e) => `${label}: ${e}`));
  await page.close();
}

mkdirSync(out, { recursive: true });
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");
for (const lang of LANGS) {
  for (const win of WINDOWS) {
    for (const [name, query, options] of SCREENS) {
      await visit(browser, lang, win, name, `${BASE}/?${query}&lang=${lang}`, options, EXTRA[name]?.(lang));
    }
  }
  for (const [name, query] of OVERLAYS) {
    await visit(browser, lang, { name: "900x300", width: 900, height: 300 }, name, `${BASE}/overlay.html?${query}&lang=${lang}`, {
      transparent: true,
      audit: false,
    });
  }
  console.log(`${lang}: xong`);
}
await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} điều kiện sai:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nĐạt: ${LANGS.join(", ")}. Ảnh ở ${out}`);
