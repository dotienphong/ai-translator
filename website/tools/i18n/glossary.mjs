// Bảng thuật ngữ cho người dịch website sang ja/zh/ko (kế hoạch 2026-10-22-website-ja-zh-ko-04): với từng trang en, các nhãn giao
// diện của app nhắc trong <strong> kèm chữ của app ở ngôn ngữ đích; cuối bảng là tên mục của macOS và Windows.
//   node tools/i18n/glossary.mjs ja > ../target/website-cjk/glossary.ja.md
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appLabelsIn, readDict } from "./labels.mjs";

/** Tên mục của hệ điều hành theo ngôn ngữ (theo hiểu biết, chưa đối chiếu trên máy thật). */
export const OS_TERMS = [
  ["System Settings (macOS)", { ja: "システム設定", zh: "系统设置", ko: "시스템 설정" }],
  ["Privacy & Security (macOS)", { ja: "プライバシーとセキュリティ", zh: "隐私与安全性", ko: "개인정보 보호 및 보안" }],
  ["Screen & System Audio Recording (macOS 15 trở lên)", { ja: "画面収録とシステムオーディオ録音", zh: "录屏与系统录音", ko: "화면 및 시스템 오디오 녹음" }],
  ["Accessibility (macOS)", { ja: "アクセシビリティ", zh: "辅助功能", ko: "손쉬운 사용" }],
  ["Microphone", { ja: "マイク", zh: "麦克风", ko: "마이크" }],
  ["Open Anyway (macOS)", { ja: "このまま開く", zh: "仍要打开", ko: "확인 없이 열기" }],
  ["Login Items (macOS)", { ja: "ログイン項目", zh: "登录项", ko: "로그인 항목" }],
  ["Applications (thư mục macOS)", { ja: "アプリケーション", zh: "应用程序", ko: "응용 프로그램" }],
  ["Terminal (macOS)", { ja: "ターミナル", zh: "终端", ko: "터미널" }],
  ["Keychain Access (macOS)", { ja: "キーチェーンアクセス", zh: "钥匙串访问", ko: "키체인 접근" }],
  ["menu bar (macOS)", { ja: "メニューバー", zh: "菜单栏", ko: "메뉴 막대" }],
  ["Settings (Windows)", { ja: "設定", zh: "设置", ko: "설정" }],
  ["Privacy & security (Windows)", { ja: "プライバシーとセキュリティ", zh: "隐私和安全性", ko: "개인 정보 및 보안" }],
  ["System › Sound (Windows)", { ja: "システム › サウンド", zh: "系统 › 声音", ko: "시스템 › 소리" }],
  ["More info / Run anyway (SmartScreen)", { ja: "詳細情報 / 実行", zh: "更多信息 / 仍要运行", ko: "추가 정보 / 실행" }],
  ["system tray (Windows)", { ja: "システムトレイ（通知領域）", zh: "系统托盘（通知区域）", ko: "시스템 트레이(알림 영역)" }],
  ["Start menu (Windows)", { ja: "スタートメニュー", zh: "开始菜单", ko: "시작 메뉴" }],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lang = process.argv[2];
  if (!["ja", "zh", "ko"].includes(lang)) throw new Error("cần ngôn ngữ ja, zh hoặc ko");
  const tmp = mkdtempSync(path.join(tmpdir(), "glossary-"));
  process.env.WEBSITE_DIST = tmp;
  const { build, DIST } = await import("../../src/build/build.mjs");
  await build();
  const { pages } = await import("../../src/content/index.mjs");
  const en = readDict("en");
  const target = readDict(lang);
  const lines = [`# Thuật ngữ ${lang} (sinh bởi tools/i18n/glossary.mjs; chữ của app phải dùng nguyên văn)`, ""];
  for (const p of pages.filter((x) => x.lang === "en")) {
    const html = readFileSync(path.join(DIST, p.path, "index.html"), "utf8");
    const labels = appLabelsIn(html, en);
    if (!labels.length) continue;
    lines.push(`## ${p.id}`, "", `| en | ${lang} | khóa |`, "|---|---|---|");
    for (const { en: label, keys } of labels) lines.push(`| ${label} | ${[...new Set(keys.map((k) => target.get(k)).filter(Boolean))].join(" / ")} | ${keys.join(", ")} |`);
    lines.push("");
  }
  lines.push("## Tên mục của macOS và Windows", "", `| en | ${lang} |`, "|---|---|");
  for (const [name, t] of OS_TERMS) lines.push(`| ${name} | ${t[lang]} |`);
  console.log(lines.join("\n"));
  rmSync(tmp, { recursive: true, force: true });
}
