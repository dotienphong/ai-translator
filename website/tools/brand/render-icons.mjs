// Sinh biểu tượng PNG/ICO từ logo vector: node tools/brand/render-icons.mjs   (cần Google Chrome; không cần thư viện)
// Mỗi cỡ được vẽ bằng <img> co giãn trong trang HTML cỡ đúng (SVG có width/height cố định sẽ bị cắt nếu chụp thẳng).
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../src");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const tmp = mkdtempSync(path.join(tmpdir(), "icons-"));

function render(svg, size, out) {
  const html = path.join(tmp, `i${size}.html`);
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${pathToFileURL(svg).href}" alt="">`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000", "--force-device-scale-factor=1", `--window-size=${size},${size}`, `--screenshot=${out}`, pathToFileURL(html).href], { stdio: "ignore" });
}

const logo = path.join(src, "assets/img/logo.svg");
const apple = path.join(here, "apple-touch-icon.svg");
render(logo, 512, path.join(src, "assets/img/logo-512.png"));
render(logo, 192, path.join(src, "assets/img/icon-192.png"));
render(logo, 32, path.join(src, "public/favicon-32.png"));
render(logo, 48, path.join(tmp, "favicon-48.png"));
render(apple, 180, path.join(src, "public/apple-touch-icon.png"));

// favicon.ico chứa ảnh PNG 48×48 (định dạng ICO cho phép PNG bên trong).
const png = readFileSync(path.join(tmp, "favicon-48.png"));
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt8(48, 6); header.writeUInt8(48, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
writeFileSync(path.join(src, "public/favicon.ico"), Buffer.concat([header, png]));
console.log("đã sinh logo-512, icon-192, favicon-32, favicon.ico, apple-touch-icon");
