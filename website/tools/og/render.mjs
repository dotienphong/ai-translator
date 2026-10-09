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

const SRC = { vi: ["Let's review the timeline in the next meeting.", "Hãy xem lại tiến độ trong cuộc họp tiếp theo."], en: ["来週までに見積書をお送りします。", "We will send the quotation by next week."] };
const TAG = { vi: "macOS · Windows", en: "macOS · Windows" };
// [tên, vi:{t,s}, en:{t,s}] — tiêu đề ngắn (hiện lớn) và dòng phụ.
const SET = [
  ["default", { t: "Dịch cuộc họp bằng AI, chạy trên máy bạn", s: "Độ trễ thấp. Không gửi dữ liệu lên cloud." }, { t: "AI meeting translation that runs on your computer", s: "Low latency. No data sent to the cloud." }],
  ["features", { t: "Mọi thứ để hiểu một cuộc họp bằng ngoại ngữ", s: "Thanh phụ đề, từ điển thuật ngữ, lịch sử, xuất file, 5 ngôn ngữ." }, { t: "Everything to follow a meeting in another language", s: "Subtitle bar, glossary, history, export, 5 languages." }],
  ["pricing", { t: "Free dùng thử · 50.000 ₫ · 500.000 ₫", s: "Ba gói trả trước bằng VietQR, không tự gia hạn." }, { t: "Free trial · 50,000 ₫ · 500,000 ₫", s: "Three prepaid plans via VietQR, no auto-renewal." }],
  ["download", { t: "Tải AI Translator cho macOS và Windows", s: "Cài bằng một dòng lệnh. Dùng thử Free 10 ngày." }, { t: "Get AI Translator for macOS and Windows", s: "Install with one command. 10-day free trial." }],
  ["guide", { t: "Hướng dẫn sử dụng AI Translator", s: "Cài đặt, cấp quyền, phím tắt, từ điển, khắc phục sự cố." }, { t: "AI Translator user guides", s: "Install, permissions, shortcuts, glossary, troubleshooting." }],
  ["solutions", { t: "Phụ đề dịch cho họp, webinar và video", s: "Zoom, Teams, Meet, Zalo PC: không bot, không plugin." }, { t: "Translated subtitles for meetings, webinars and video", s: "Zoom, Teams, Meet, Zalo PC: no bot, no plugin." }],
  ["compare", { t: "Dịch offline hay dịch cloud?", s: "So sánh cân bằng: riêng tư, internet, ngôn ngữ, phần cứng." }, { t: "Offline or cloud translation?", s: "A balanced comparison: privacy, internet, languages, hardware." }],
  ["about", { t: "Về AI Translator", s: "Xây cho người họp bằng ngoại ngữ, riêng tư theo thiết kế." }, { t: "About AI Translator", s: "Built for people who meet in another language, private by design." }],
  ["security", { t: "Dữ liệu và bảo mật", s: "Âm thanh ở lại trên máy. Đây là mọi thứ chúng tôi lưu." }, { t: "Data and security", s: "Audio stays on your device. Here is everything we store." }],
  ["faq", { t: "Câu hỏi thường gặp", s: "Offline, riêng tư, ngôn ngữ, giá, cài đặt, khắc phục sự cố." }, { t: "Frequently asked questions", s: "Offline, privacy, languages, pricing, install, troubleshooting." }],
  ["contact", { t: "Liên hệ và hỗ trợ", s: "support@aitranslator.io.vn" }, { t: "Contact and support", s: "support@aitranslator.io.vn" }],
  ["legal", { t: "Điều khoản và quyền riêng tư", s: "Văn bản đầy đủ của AI Translator." }, { t: "Terms and privacy", s: "The full legal texts of AI Translator." }],
];
const IMAGES = SET.flatMap(([name, vi, en]) => [
  [`${name}-vi`, { lang: "vi", tag: TAG.vi, langs: "EN → VI", src: SRC.vi[0], dst: SRC.vi[1], ...vi }],
  [`${name}-en`, { lang: "en", tag: TAG.en, langs: "JA → EN", src: SRC.en[0], dst: SRC.en[1], ...en }],
]);
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
