// Đo trang chủ khi rút gọn nội dung (spec 2026-10-27-trang-chu-ba-viec-tab-design, mục Kiểm). Chạy trong website/:
//   node tools/measure-home.mjs                    số chữ từng phần của trang chủ vi và en (bản dựng)
//   node tools/measure-home.mjs --browser          thêm chữ nhìn thấy ngay (innerText của <main>, chưa bấm tab hay mở mục) và chiều
//                                                  cao trang ở 1280 và 375 px, năm ngôn ngữ (cần Chrome; chữ ja/zh/ko không tách bằng
//                                                  khoảng trắng nên con số của chúng chỉ để so trước và sau)
//   node tools/measure-home.mjs --shots=<thư mục>  như --browser, và chụp ảnh: home-<lang>-1280.png, home-<lang>-375.png (toàn
//                                                  trang), home-vi-375-dark.png, tab-vi-<id>.png (ba tab ở 1280 px)
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const shots = args.find((a) => a.startsWith("--shots="))?.slice("--shots=".length);
const withBrowser = args.includes("--browser") || Boolean(shots);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DIST = mkdtempSync(join(tmpdir(), "measure-dist-"));
process.env.WEBSITE_DIST = DIST;
const { build } = await import("../src/build/build.mjs");
await build();

const HOME = { vi: "/", en: "/en/", ja: "/ja/", zh: "/zh/", ko: "/ko/" };
const words = (html) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
const mainOf = (h) => /<main id="main">([\s\S]*)<\/main>/.exec(h)?.[1] ?? "";

for (const lang of ["vi", "en"]) {
  const main = mainOf(readFileSync(join(DIST, HOME[lang], "index.html"), "utf8"));
  console.log(`\n== ${lang}: số chữ từng phần (trong HTML, tính cả phần ẩn) ==`);
  let total = 0;
  for (const part of main.split(/(?=<section\b)/).filter((p) => p.startsWith("<section"))) {
    const attrs = /^<section\b([^>]*)>/.exec(part)[1];
    const label = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? /\bclass="([^"]+)"/.exec(attrs)?.[1] ?? "?";
    const w = words(part.slice(0, part.indexOf("</section>")));
    total += w;
    console.log(`${label.padEnd(24)}${String(w).padStart(6)}`);
  }
  console.log(`${"TỔNG".padEnd(24)}${String(total).padStart(6)}`);
}

if (withBrowser) {
  const { start } = await import("../src/serve.mjs");
  const { launch } = await import("./browser/cdp.mjs");
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch();
  try {
    if (shots) mkdirSync(shots, { recursive: true });
    console.log("\n== chữ nhìn thấy ngay (thayNgay) và chiều cao trang (px) ==");
    for (const [lang, path] of Object.entries(HOME)) {
      const row = { lang };
      for (const width of [1280, 375]) {
        const p = await browser.newPage({ width, height: 900, mobile: width < 700 });
        await p.goto(base + path);
        await sleep(300);
        row[`cao${width}`] = await p.eval("document.documentElement.scrollHeight");
        if (width === 1280) row.thayNgay = await p.eval(`document.querySelector("main").innerText.split(/\\s+/).filter(Boolean).length`);
        if (shots) await p.screenshot(join(shots, `home-${lang}-${width}.png`), { full: true });
        await p.close();
      }
      console.log(JSON.stringify(row));
    }
    if (shots) {
      const dark = await browser.newPage({ width: 375, height: 800, mobile: true, dark: true });
      await dark.goto(base + HOME.vi);
      await sleep(300);
      await dark.screenshot(join(shots, "home-vi-375-dark.png"), { full: true });
      await dark.close();
      const p = await browser.newPage({ width: 1280, height: 900 });
      await p.goto(base + HOME.vi);
      for (const id of ["dich-cuoc-hop", "go-dich", "lich-su"]) {
        const tab = `[role="tab"][aria-controls="${id}"]`;
        if (await p.eval(`Boolean(document.querySelector(${JSON.stringify(tab)}))`)) {
          await p.click(tab);
          await sleep(450);
          await p.screenshot(join(shots, `tab-vi-${id}.png`), { clipSelector: "[data-ftabs]" });
        }
      }
      await p.close();
      console.log(`\nẢnh đã lưu ở ${shots}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}
rmSync(DIST, { recursive: true, force: true });
