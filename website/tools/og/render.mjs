// Sinh ảnh chia sẻ 1200×630 cho website: node tools/og/render.mjs [tên-ảnh | ngôn ngữ …]   (cần Google Chrome; không cần thư viện)
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

// Câu phụ đề minh họa trên thẻ bên phải: [nhãn, câu gốc, bản dịch] theo ngôn ngữ của ảnh.
const SRC = {
  vi: ["EN → VI", "Let's review the timeline in the next meeting.", "Hãy xem lại tiến độ trong cuộc họp tiếp theo."],
  en: ["JA → EN", "来週までに見積書をお送りします。", "We will send the quotation by next week."],
  ja: ["EN → JA", "We will send the quotation by next week.", "来週までに見積書をお送りします。"],
  zh: ["EN → ZH", "Let's review the timeline in the next meeting.", "我们在下次会议上再看一下进度。"],
  ko: ["EN → KO", "Can you share the budget estimate by Friday?", "금요일까지 예산 견적을 공유해 주실 수 있나요?"],
};
// Thẻ BCP 47 cho <html lang> của template (Chrome chọn phông CJK theo nó).
const TAG = { vi: "vi", en: "en", ja: "ja", zh: "zh-Hans", ko: "ko" };
// [tên nhóm, { ngôn ngữ: { t: tiêu đề ngắn (hiện lớn), s: dòng phụ } }]. Nhóm "legal" chỉ có vi, en (trang pháp lý không có bản ja/zh/ko).
const SET = [
  ["default", {
    vi: { t: "Dịch cuộc họp bằng AI, chạy trên máy bạn", s: "Độ trễ thấp. Không gửi dữ liệu lên cloud." },
    en: { t: "AI meeting translation that runs on your computer", s: "Low latency. No data sent to the cloud." },
    ja: { t: "パソコン上で動く AI 会議翻訳", s: "低遅延。データをクラウドに送りません。" },
    zh: { t: "在你电脑上运行的 AI 会议翻译", s: "低延迟。不把数据发送到云端。" },
    ko: { t: "내 컴퓨터에서 실행되는 AI 회의 번역", s: "낮은 지연. 데이터를 클라우드로 보내지 않습니다." },
  }],
  ["features", {
    vi: { t: "Mọi thứ để hiểu một cuộc họp bằng ngoại ngữ", s: "Thanh phụ đề, từ điển thuật ngữ, lịch sử, xuất file, 5 ngôn ngữ." },
    en: { t: "Everything to follow a meeting in another language", s: "Subtitle bar, glossary, history, export, 5 languages." },
    ja: { t: "外国語の会議を理解するためのすべて", s: "字幕バー、用語集、履歴、書き出し、5 言語。" },
    zh: { t: "听懂外语会议所需的一切", s: "字幕条、术语表、历史记录、导出、5 种语言。" },
    ko: { t: "외국어 회의를 이해하는 데 필요한 모든 것", s: "자막 바, 용어집, 기록, 내보내기, 5개 언어." },
  }],
  ["pricing", {
    vi: { t: "Free dùng thử · 50.000 ₫ · 500.000 ₫", s: "Ba gói trả trước bằng VietQR hoặc thẻ quốc tế, không tự gia hạn." },
    en: { t: "Free trial · 50,000 ₫ · 500,000 ₫", s: "Three prepaid plans by VietQR or international card, no auto-renewal." },
    ja: { t: "10 日間の無料お試し · US$3.99 から", s: "前払いプラン 3 種。カード（税抜）または VietQR、自動更新なし。" },
    zh: { t: "免费试用 10 天 · US$3.99 起", s: "三种预付套餐，国际银行卡（不含税）或 VietQR，不自动续费。" },
    ko: { t: "10일 무료 체험 · US$3.99부터", s: "선불 요금제 3종, 카드(세금 별도) 또는 VietQR, 자동 갱신 없음." },
  }],
  ["download", {
    vi: { t: "Tải AI Translator cho macOS và Windows", s: "Cài bằng một dòng lệnh. Dùng thử Free 10 ngày." },
    en: { t: "Get AI Translator for macOS and Windows", s: "Install with one command. 10-day free trial." },
    ja: { t: "macOS 版と Windows 版をダウンロード", s: "コマンド 1 行でインストール。10 日間の無料お試し。" },
    zh: { t: "下载 macOS 版和 Windows 版", s: "一行命令即可安装。免费试用 10 天。" },
    ko: { t: "macOS 및 Windows용 다운로드", s: "명령 한 줄로 설치. 10일 무료 체험." },
  }],
  ["guide", {
    vi: { t: "Hướng dẫn sử dụng AI Translator", s: "Cài đặt, cấp quyền, phím tắt, từ điển, khắc phục sự cố." },
    en: { t: "AI Translator user guides", s: "Install, permissions, shortcuts, glossary, troubleshooting." },
    ja: { t: "AI Translator ユーザーガイド", s: "インストール、権限、ショートカット、用語集、トラブルシューティング。" },
    zh: { t: "AI Translator 使用指南", s: "安装、权限、快捷键、术语表、故障排除。" },
    ko: { t: "AI Translator 사용 가이드", s: "설치, 권한, 단축키, 용어집, 문제 해결." },
  }],
  ["solutions", {
    vi: { t: "Phụ đề dịch cho họp, webinar và video", s: "Zoom, Teams, Meet, Zalo PC: không bot, không plugin." },
    en: { t: "Translated subtitles for meetings, webinars and video", s: "Zoom, Teams, Meet, Zalo PC: no bot, no plugin." },
    ja: { t: "会議、ウェビナー、動画に翻訳字幕", s: "Zoom、Teams、Meet、Zalo PC：ボットもプラグインも不要。" },
    zh: { t: "为会议、网络研讨会和视频提供翻译字幕", s: "Zoom、Teams、Meet、Zalo PC：无需机器人，无需插件。" },
    ko: { t: "회의, 웨비나, 동영상에 번역 자막", s: "Zoom, Teams, Meet, Zalo PC: 봇도 플러그인도 필요 없음." },
  }],
  ["compare", {
    vi: { t: "Dịch offline hay dịch cloud?", s: "So sánh cân bằng: riêng tư, internet, ngôn ngữ, phần cứng." },
    en: { t: "Offline or cloud translation?", s: "A balanced comparison: privacy, internet, languages, hardware." },
    ja: { t: "オフライン翻訳か、クラウド翻訳か", s: "プライバシー、ネット接続、言語、ハードウェアを公平に比較。" },
    zh: { t: "离线还是云端翻译？", s: "从隐私、网络、语言、硬件全面比较。" },
    ko: { t: "오프라인 번역인가, 클라우드 번역인가?", s: "개인정보, 인터넷, 언어, 하드웨어를 균형 있게 비교." },
  }],
  ["about", {
    vi: { t: "Về AI Translator", s: "Xây cho người họp bằng ngoại ngữ, riêng tư theo thiết kế." },
    en: { t: "About AI Translator", s: "Built for people who meet in another language, private by design." },
    ja: { t: "AI Translator について", s: "外国語で会議をする人のために。設計段階からプライバシーを重視。" },
    zh: { t: "关于 AI Translator", s: "为用外语开会的人打造，从设计上保护隐私。" },
    ko: { t: "AI Translator 소개", s: "외국어로 회의하는 사람을 위해, 설계부터 개인정보를 보호합니다." },
  }],
  ["security", {
    vi: { t: "Dữ liệu và bảo mật", s: "Âm thanh ở lại trên máy. Đây là mọi thứ chúng tôi lưu." },
    en: { t: "Data and security", s: "Audio stays on your device. Here is everything we store." },
    ja: { t: "データとセキュリティ", s: "音声はパソコンに残ります。保存するものをすべて公開しています。" },
    zh: { t: "数据与安全", s: "音频留在你的设备上。这里列出我们存储的全部内容。" },
    ko: { t: "데이터와 보안", s: "음성은 기기에 남습니다. 저장하는 모든 것을 공개합니다." },
  }],
  ["faq", {
    vi: { t: "Câu hỏi thường gặp", s: "Offline, riêng tư, ngôn ngữ, giá, cài đặt, khắc phục sự cố." },
    en: { t: "Frequently asked questions", s: "Offline, privacy, languages, pricing, install, troubleshooting." },
    ja: { t: "よくある質問", s: "オフライン、プライバシー、言語、料金、インストール、トラブル対応。" },
    zh: { t: "常见问题", s: "离线、隐私、语言、价格、安装、故障排除。" },
    ko: { t: "자주 묻는 질문", s: "오프라인, 개인정보, 언어, 요금, 설치, 문제 해결." },
  }],
  ["contact", {
    vi: { t: "Liên hệ và hỗ trợ", s: "support@aitranslator.io.vn" },
    en: { t: "Contact and support", s: "support@aitranslator.io.vn" },
    ja: { t: "お問い合わせとサポート", s: "support@aitranslator.io.vn" },
    zh: { t: "联系与支持", s: "support@aitranslator.io.vn" },
    ko: { t: "문의 및 지원", s: "support@aitranslator.io.vn" },
  }],
  ["legal", {
    vi: { t: "Điều khoản và quyền riêng tư", s: "Văn bản đầy đủ của AI Translator." },
    en: { t: "Terms and privacy", s: "The full legal texts of AI Translator." },
  }],
];
const IMAGES = SET.flatMap(([name, byLang]) =>
  Object.entries(byLang).map(([lang, text]) => {
    const [langs, src, dst] = SRC[lang];
    return [`${name}-${lang}`, { lang: TAG[lang], tag: "macOS · Windows", langs, src, dst, ...text }];
  }),
);
export const list = IMAGES;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Lọc: `node tools/og/render.mjs pricing-vi ja` dựng ảnh tên pricing-vi và mọi ảnh tiếng Nhật; không đối số thì dựng hết.
  const only = new Set(process.argv.slice(2));
  for (const [name, p] of IMAGES.filter(([n]) => only.size === 0 || only.has(n) || only.has(n.split("-").pop()))) {
    const url = pathToFileURL(path.join(here, "template.html")).href + "?" + new URLSearchParams(p).toString();
    const png = path.join(out, name + ".png");
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1200,630", "--virtual-time-budget=3000", `--screenshot=${png}`, url], { stdio: "ignore" });
    // JPEG chất lượng 86 cho nhẹ (khoảng 60–90 KB); mạng xã hội đều nhận JPEG.
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "86", png, "--out", path.join(out, name + ".jpg")], { stdio: "ignore" });
    rmSync(png);
    console.log("ảnh", name);
  }
}
