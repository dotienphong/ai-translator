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
try {
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
  // Nhãn phần: id nếu có; không thì chữ của <h2> đầu tiên (tối đa 24 ký tự); không có <h2> thì class.
  const labelOf = (attrs, part) => {
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (id) return id;
    const h2 = /<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(part)?.[1];
    const text = h2?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
    return text || /\bclass="([^"]+)"/.exec(attrs)?.[1] || "?";
  };

  for (const lang of ["vi", "en"]) {
    const main = mainOf(readFileSync(join(DIST, HOME[lang], "index.html"), "utf8"));
    console.log(`\n== ${lang}: số chữ từng phần (trong HTML, tính cả phần ẩn) ==`);
    let total = 0;
    for (const part of main.split(/(?=<section\b)/).filter((p) => p.startsWith("<section"))) {
      const attrs = /^<section\b([^>]*)>/.exec(part)[1];
      const inner = part.slice(0, part.indexOf("</section>"));
      const w = words(inner);
      total += w;
      console.log(`${labelOf(attrs, inner).padEnd(26)}${String(w).padStart(6)}`);
    }
    console.log(`${"TỔNG".padEnd(26)}${String(total).padStart(6)}`);
  }

  if (withBrowser) {
    const { start } = await import("../src/serve.mjs");
    const { launch } = await import("./browser/cdp.mjs");
    const server = await start(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    let browser = null;
    try {
      browser = await launch();
      if (!browser) {
        console.error("Không tìm thấy Chrome (đặt biến CHROME=<đường dẫn>); bỏ qua phần đo bằng trình duyệt.");
        process.exitCode = 1;
      } else {
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
      }
    } finally {
      await browser?.close();
      server.close();
    }
  }
} finally {
  rmSync(DIST, { recursive: true, force: true });
}
