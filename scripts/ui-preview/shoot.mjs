// Chụp lại ảnh giao diện app cho website (website/src/assets/img/app/): giao diện thật của `src/` chạy trên trang xem trước
// (vite.config.ts, IPC giả) trong Chrome không đầu, cỡ cửa sổ mặc định của app (960×640) ở tỉ lệ 1,5 → ảnh 1440×960. Ghi
// WebP (cần `cwebp`) và cập nhật dung lượng, kích thước trong manifest.json; mô tả (alt) giữ nguyên, sửa tay khi cảnh đổi.
//
//   pnpm exec vite --config scripts/ui-preview/vite.config.ts   # một cửa sổ Terminal
//   node scripts/ui-preview/shoot.mjs [tên…]                    # cửa sổ khác; không có tên thì chụp hết
//
// Chụp lại mỗi khi giao diện đổi (website/README.md). Không chụp màn hình lộ tên thư viện hay model (danh sách giấy phép,
// Cài đặt › Model): ảnh Giới thiệu chỉ lấy phần trên.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../website/tools/browser/cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../website/src/assets/img/app");
const BASE = "http://127.0.0.1:1430";

// [tên ảnh, tham số URL, tùy chọn]. Tên có ".dark" thì chụp giao diện tối.
const APP = [
  ["app-home-running", "screen=home&session=running"],
  ["app-home-running.dark", "screen=home&session=running&theme=dark"],
  ["app-home-free", "screen=home&plan=free"],
  ["app-transcript", "screen=transcript", { srt: true }],
  ["app-history", "screen=history"],
  ["app-glossary", "screen=glossary"],
  ["app-settings-subtitles", "screen=settings&group=subtitles"],
  ["app-settings-subtitles.dark", "screen=settings&group=subtitles&theme=dark&size=26&text=yellow&bg=navy&opacity=0.8"],
  ["app-settings-audio", "screen=settings&group=audio"],
  ["app-settings-hotkeys", "screen=settings&group=hotkeys"],
  ["app-settings-license", "screen=settings&group=license"],
  ["app-settings-privacy", "screen=settings&group=privacy&history=0"],
  ["app-upgrade", "screen=upgrade&plan=free"],
  ["app-upgrade-qr", "screen=upgrade&plan=free&checkout=1"],
  ["app-about", "screen=about", { height: 580 }],
  ...Array.from({ length: 9 }, (_, i) => [`app-onboarding-${i + 1}`, `onboarding=${i + 1}${i === 3 ? "&download=1" : ""}`]),
];
const OVERLAY = [
  ["overlay-default", "session=running", { height: 224 }],
  ["overlay-custom", "session=running&locked=1&text=yellow&size=26&bg=navy&opacity=0.8", { height: 200 }],
  ["overlay-locked", "session=running&locked=1", { height: 224 }],
];

const only = new Set(process.argv.slice(2));
const want = ([name]) => only.size === 0 || only.has(name);
const manifestPath = path.join(out, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tmp = mkdtempSync(path.join(tmpdir(), "ui-shots-"));
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");
const errors = [];

async function shoot(slug, lang, url, { width, height, dpr, dark, transparent, prepare, cropHeight }) {
  const page = await browser.newPage({ width, height, dpr, dark });
  if (transparent) await page.s.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await page.goto(url);
  await new Promise((r) => setTimeout(r, 900));
  if (prepare) await page.eval(prepare);
  await new Promise((r) => setTimeout(r, 300));
  // Chrome tự xin /favicon.ico (trang xem trước không có): bỏ qua lỗi 404 đó.
  errors.push(...page.errors.filter((e) => !e.includes("status of 404")).map((e) => `${slug}.${lang}: ${e}`));
  const png = path.join(tmp, `${slug}.${lang}.png`);
  // Ảnh thấp hơn cửa sổ: chỉ lấy phần trên cùng (`cropHeight` tính bằng điểm ảnh của file).
  const clip = cropHeight ? { x: 0, y: 0, width, height: cropHeight / dpr, scale: 1 } : undefined;
  const shot = await page.s.send("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
  writeFileSync(png, Buffer.from(shot.data, "base64"));
  await page.close();
  const file = `${slug}.${lang}.webp`;
  execFileSync("cwebp", ["-quiet", "-q", "86", "-alpha_q", "100", png, "-o", path.join(out, file)]);
  const entry = manifest.find((e) => e.file === file);
  if (!entry) throw new Error(`manifest.json không có ${file}`);
  entry.bytes = statSync(path.join(out, file)).size;
  const size = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", png], { encoding: "utf8" });
  entry.width = Number(/pixelWidth: (\d+)/.exec(size)?.[1] ?? entry.width);
  entry.height = Number(/pixelHeight: (\d+)/.exec(size)?.[1] ?? entry.height);
  console.log(`${file} ${entry.bytes} B`);
}

for (const lang of ["vi", "en"]) {
  for (const [slug, query, opts = {}] of APP.filter(want)) {
    const dark = slug.includes(".dark");
    // Chọn SRT ở ô xuất file (mô tả ảnh nhắc tới xuất SRT); sự kiện `change` để React nhận.
    const prepare = opts.srt
      ? `(() => { const s = document.querySelector("#export-format"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "srt"); s.dispatchEvent(new Event("change", { bubbles: true })); })()`
      : undefined;
    await shoot(slug, lang, `${BASE}/?${query}&lang=${lang}`, {
      width: 960,
      height: 640,
      dpr: 1.5,
      dark,
      prepare,
      cropHeight: opts.height,
    });
  }
  for (const [slug, query, opts] of OVERLAY.filter(want)) {
    await shoot(slug, lang, `${BASE}/overlay.html?${query}&lang=${lang}`, {
      width: 900,
      height: opts.height,
      dpr: 2,
      transparent: true,
    });
  }
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
