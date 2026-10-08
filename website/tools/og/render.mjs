// Sinh ảnh chia sẻ 1200×630 cho website: node tools/og/render.mjs   (cần Google Chrome; không cần thư viện)
// Ảnh được commit vào src/assets/og/. Sửa danh sách bên dưới rồi chạy lại khi đổi tiêu đề.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../src/assets/og");
mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const IMAGES = [
  ["default-vi", { lang: "vi", tag: "Beta · macOS", t: "Phụ đề dịch trực tiếp cho mọi cuộc họp", s: "Chạy offline trên máy bạn. Không bot, không tài khoản." }],
  ["default-en", { lang: "en", tag: "Beta · macOS", t: "Live translated subtitles for every meeting", s: "Runs offline on your computer. No bot, no account.", src: "Let's review the timeline in the next meeting.", dst: "Let's review the timeline in the next meeting." }],
];
export const list = IMAGES;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, p] of IMAGES) {
    const url = pathToFileURL(path.join(here, "template.html")).href + "?" + new URLSearchParams(p).toString();
    const png = path.join(out, name + ".png");
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1200,630", "--virtual-time-budget=3000", `--screenshot=${png}`, url], { stdio: "ignore" });
    // JPEG chất lượng 86 cho nhẹ (khoảng 60–90 KB); mạng xã hội đều nhận JPEG.
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "86", png, "--out", path.join(out, name + ".jpg")], { stdio: "ignore" });
    rmSync(png);
    console.log("ảnh", name);
  }
}
