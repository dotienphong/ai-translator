// Chụp lại ảnh giao diện app cho website (website/src/assets/img/app/): giao diện thật của `src/` chạy trên trang xem trước
// (vite.config.ts, IPC giả) trong Chrome không đầu, cỡ cửa sổ mặc định của app (960×640) ở tỉ lệ 1,5 → ảnh 1440×960 (cảnh
// `fit` cao hơn cho vừa nội dung). Ghi WebP (cần `cwebp`; kích thước đọc bằng `sips`, chỉ có trên macOS) và cập nhật dung
// lượng, kích thước trong manifest.json; mô tả trong manifest và alt ở website/src/content/ giữ nguyên, sửa tay khi cảnh đổi.
//
//   pnpm exec vite --config scripts/ui-preview/vite.config.ts   # một cửa sổ Terminal (cổng 1430)
//   node scripts/ui-preview/shoot.mjs [tên…]                    # cửa sổ khác; không có tên thì chụp hết
//   node scripts/ui-preview/shoot.mjs --port=1431 [tên…]        # Vite ở cổng khác (hay đặt UI_PREVIEW_PORT=1431)
//   node scripts/ui-preview/shoot.mjs --lang=ja,zh,ko [tên…]    # chỉ các ngôn ngữ này (mặc định cả năm: vi, en, ja, zh, ko)
//
// Chụp lại mỗi khi giao diện đổi (website/README.md). Không chụp màn hình lộ tên thư viện hay model (danh sách giấy phép,
// Cài đặt › Model): ảnh Giới thiệu chỉ lấy phần trên. Ảnh lặp lại được: múi giờ của Chrome cố định (TIMEZONE), cảnh có giờ
// hạn đơn dùng giờ cố định (FROZEN, tham số `now=` của mock), phiên bản ở chân thanh bên lấy từ src-tauri/tauri.conf.json.
//
// Các cảnh `app-upgrade*` có thẻ quốc tế và giá USD (bản en chọn sẵn thẻ, theo ngôn ngữ giao diện): chỉ đăng ảnh chụp lại khi
// Creem đã bán thật, nếu không website nói về một cách trả chưa có; muốn chụp cảnh chưa bán thẻ thì thêm `usd=0` vào tham số cảnh.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../website/tools/browser/cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../website/src/assets/img/app");
const args = process.argv.slice(2);
const PORT = Number(args.find((a) => a.startsWith("--port="))?.slice("--port=".length) ?? process.env.UI_PREVIEW_PORT ?? 1430);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error(`cổng Vite không hợp lệ: ${PORT}`);
const BASE = `http://127.0.0.1:${PORT}`;
// Ngôn ngữ cần chụp: `--lang=ja,zh,ko`; không có thì cả năm ngôn ngữ giao diện của app.
const ALL_LANGS = ["vi", "en", "ja", "zh", "ko"];
const LANGS = (args.find((a) => a.startsWith("--lang="))?.slice("--lang=".length).split(",") ?? ALL_LANGS).filter(Boolean);
for (const l of LANGS) if (!ALL_LANGS.includes(l)) throw new Error(`ngôn ngữ không hợp lệ: ${l} (cần một trong ${ALL_LANGS.join(", ")})`);
// Múi giờ của Chrome (giờ hạn đơn trên màn hình hiện theo múi giờ cục bộ) và giờ cố định của cảnh có giờ hạn đơn
// (mock: `now=`, 10:00 giờ Việt Nam): ảnh giống nhau giữa các lần chụp và các máy.
const TIMEZONE = "Asia/Ho_Chi_Minh";
const FROZEN = "now=2026-10-16T03:00:00Z";

// [tên ảnh, tham số URL, tùy chọn]. Tên có ".dark" thì chụp giao diện tối. Tùy chọn: `height` cắt ảnh còn bấy nhiêu điểm ảnh
// (cảnh thấp hơn cửa sổ); `fit` nới cửa sổ cho vừa cả nội dung màn hình (cảnh Nâng cấp dài hơn 640 px, nếu không thì đơn
// thanh toán và nút bấm bị cắt mép dưới); `langs` chỉ chụp các ngôn ngữ này (không có thì mọi ngôn ngữ đang chụp).
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
  ["app-settings-compose", "screen=settings&group=compose"],
  ["app-settings-license", "screen=settings&group=license"],
  ["app-settings-privacy", "screen=settings&group=privacy&history=0"],
  ["app-upgrade", "screen=upgrade&plan=free", { fit: true }],
  ["app-upgrade-qr", `screen=upgrade&plan=free&checkout=1&${FROZEN}`, { fit: true }],
  ["app-upgrade-card", `screen=upgrade&plan=free&checkout=card&${FROZEN}`, { fit: true }],
  ["app-about", "screen=about", { height: 580 }],
  ...Array.from({ length: 9 }, (_, i) => [`app-onboarding-${i + 1}`, `onboarding=${i + 1}${i === 3 ? "&download=1" : ""}`]),
];
// Ô soạn Gõ dịch (compose.html, rộng 560 px như cửa sổ thật): trang tự gõ chữ mẫu rồi chờ dịch như thật; ảnh cắt đúng khung
// `.compose`, nền trong suốt (website đặt nó trên nền tối như thanh phụ đề).
const COMPOSE = [["compose-done", "state=done"]];
const OVERLAY = [
  ["overlay-default", "session=running", { height: 224 }],
  ["overlay-custom", "session=running&locked=1&text=yellow&size=26&bg=navy&opacity=0.8", { height: 200 }],
  ["overlay-locked", "session=running&locked=1", { height: 224 }],
];

const only = new Set(args.filter((a) => !a.startsWith("--")));
const want = ([name]) => only.size === 0 || only.has(name);
const manifestPath = path.join(out, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tmp = mkdtempSync(path.join(tmpdir(), "ui-shots-"));
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");
const errors = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Nới cửa sổ cho vừa cả phần cuộn của `.content` (cao hơn 640 px khi có nhóm cách trả, lưới gói và đơn thanh toán), cuộn khối
// đơn `.checkout` (nếu có) vào khung, rồi kiểm không còn gì bị cắt: ảnh thiếu mép dưới thì báo lỗi, không lặng lẽ đăng.
async function fitWindow(page, { width, dpr }) {
  const need = await page.eval(`document.querySelector(".content").scrollHeight`);
  await page.s.send("Emulation.setDeviceMetricsOverride", { width, height: Math.max(need, page.opts.height), deviceScaleFactor: dpr, mobile: false });
  await sleep(300);
  await page.eval(`document.querySelector(".checkout")?.scrollIntoView({ block: "nearest" })`);
  const cut = await page.eval(`(() => { const c = document.querySelector(".content"); return c.scrollHeight - c.clientHeight; })()`);
  if (cut > 0) throw new Error(`cửa sổ vẫn thấp hơn nội dung ${cut} px`);
}

async function shoot(slug, lang, url, { width, height, dpr, dark, transparent, prepare, cropHeight, fit, clipSelector }) {
  const page = await browser.newPage({ width, height, dpr, dark });
  await page.s.send("Emulation.setTimezoneOverride", { timezoneId: TIMEZONE });
  if (transparent) await page.s.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await page.goto(url);
  await sleep(900);
  if (prepare) await page.eval(prepare);
  if (fit) await fitWindow(page, { width, dpr });
  await sleep(300);
  // Chrome tự xin /favicon.ico (trang xem trước không có): bỏ qua lỗi 404 đó.
  errors.push(...page.errors.filter((e) => !e.includes("status of 404")).map((e) => `${slug}.${lang}: ${e}`));
  const png = path.join(tmp, `${slug}.${lang}.png`);
  // Ảnh thấp hơn cửa sổ: chỉ lấy phần trên cùng (`cropHeight` tính bằng điểm ảnh của file).
  // `clipSelector`: chỉ lấy khung của phần tử đó (tính bằng điểm CSS).
  const clip = clipSelector
    ? await page.eval(`(() => { const r = document.querySelector(${JSON.stringify(clipSelector)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: Math.ceil(r.width), height: Math.ceil(r.height), scale: 1 }; })()`)
    : cropHeight
      ? { x: 0, y: 0, width, height: cropHeight / dpr, scale: 1 }
      : undefined;
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

try {
  for (const lang of LANGS) {
    for (const [slug, query, opts = {}] of APP.filter(want).filter(([, , o]) => !o?.langs || o.langs.includes(lang))) {
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
        fit: opts.fit,
      });
    }
    for (const [slug, query] of COMPOSE.filter(want)) {
      await shoot(slug, lang, `${BASE}/compose.html?${query}&lang=${lang}`, {
        width: 560,
        height: 420,
        dpr: 2,
        transparent: true,
        clipSelector: ".compose",
        // Ô soạn chọn sẵn bản nháp khi mở: bỏ vùng chọn để ảnh không có nền xám trên chữ.
        prepare: `(() => { const t = document.querySelector("textarea"); t.setSelectionRange(t.value.length, t.value.length); t.blur(); })()`,
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
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
  // Ghi cả khi một cảnh lỗi giữa chừng: các ảnh đã ghi vẫn khớp dung lượng trong manifest.
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
