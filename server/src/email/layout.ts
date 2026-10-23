// Khung HTML của thư gửi khách (spec 2026-10-23 §2): bảng lồng, kiểu đặt inline, không ảnh (hộp thư chặn ảnh từ xa, tải ảnh là
// một cách theo dõi người đọc), không font web, không script. Mọi chữ động đi qua escapeHtml; link chỉ trỏ tới SITE_URL. Màu theo
// website (website/src/assets/site.css). Khối <style> lo màn hình hẹp và hộp thư tối (Apple Mail, iOS Mail, Outlook cho Mac);
// Gmail bỏ qua khối này và tự đảo màu, nên bản sáng vẫn phải đọc được khi bị đảo.
import type { Lang } from "../lang";
import { SITE_URL } from "./strings";

const C = {
  bg: "#f1f5fb",
  card: "#ffffff",
  line: "#dfe7f2",
  lineStrong: "#c6d3e6",
  ink: "#0b1322",
  ink2: "#3d4a63",
  ink3: "#6b7891",
  brand: "#1d63c9",
  brandInk: "#0f4aa3",
  brandSoft: "#e7f0ff",
};
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Hiragino Sans','Yu Gothic','PingFang SC','Microsoft YaHei','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const MONO = "'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

// Màn hình ≤ 600 px: key 34 ký tự cỡ 14 px vừa một dòng ở 375 px. Bảng màu tối theo website.
const STYLE = [
  "body{margin:0;padding:0;-webkit-text-size-adjust:100%}",
  "@media (max-width:600px){.card{border-radius:0!important;border-left:0!important;border-right:0!important}.pad{padding-left:20px!important;padding-right:20px!important}.key{font-size:14px!important;letter-spacing:0!important}.outer{padding:0!important}}",
  "@media (prefers-color-scheme:dark){.bg{background:#080d18!important}.card{background:#111a2d!important;border-color:#1f2c47!important}.ink{color:#eef3fb!important}.ink2{color:#c3cde0!important}.ink3{color:#98a5bf!important}.keybox{background:#12274a!important;border-color:#2b3b5c!important}.key{color:#8fc0ff!important}.soft{background:#0c1322!important;border-color:#1f2c47!important}.rule{border-color:#1f2c47!important}.num{background:#12274a!important;color:#8fc0ff!important}a{color:#8fc0ff!important}}",
].join("\n");

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}

/** Cả thư. `rows` là các hàng `<tr>` của thẻ thư: mainRow, rồi RULE_ROW và englishRow, hay END_ROW khi không có phần tiếng Anh. */
export function emailPage(lang: Lang, subject: string, preheader: string, rows: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
${STYLE}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${C.bg};">
<tr><td align="center" class="outer" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:14px;font-family:${FONT};">
<tr><td class="pad" style="padding:24px 32px 0;"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${C.brand};vertical-align:middle;"></span><span class="ink" style="font-size:15px;font-weight:700;color:${C.ink};vertical-align:middle;letter-spacing:.2px;">&nbsp;AI Translator</span></td></tr>
${rows}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FONT};">
<tr><td class="ink3" align="center" style="padding:18px 20px 0;font-size:12px;line-height:18px;color:${C.ink3};">AI Translator · <a href="${SITE_URL}/" style="color:${C.ink3};text-decoration:underline;">aitranslator.io.vn</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Phần ngôn ngữ của khách. */
export const mainRow = (inner: string) => `<tr><td class="pad" style="padding:20px 32px 8px;">${inner}</td></tr>`;
/** Đường kẻ giữa phần ngôn ngữ của khách và phần tiếng Anh. */
export const RULE_ROW = `<tr><td class="pad" style="padding:8px 32px 0;"><div class="rule" style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;">&nbsp;</div></td></tr>`;
/** Phần tiếng Anh ở dưới. */
export const englishRow = (inner: string) => `<tr><td class="pad" lang="en" style="padding:20px 32px 26px;">${inner}</td></tr>`;
/** Khoảng trống cuối thẻ khi thư chỉ có tiếng Anh. */
export const END_ROW = `<tr><td style="height:18px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

export const eyebrow = (text: string) =>
  `<p class="ink3" style="margin:0 0 6px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:${C.ink3};">${escapeHtml(text)}</p>`;

export const heading = (text: string) =>
  `<h1 class="ink" style="margin:0 0 10px;font-size:22px;line-height:30px;font-weight:700;color:${C.ink};">${escapeHtml(text)}</h1>`;

export const subheading = (text: string) =>
  `<h2 class="ink" style="margin:0 0 8px;font-size:16px;line-height:22px;font-weight:700;color:${C.ink};">${escapeHtml(text)}</h2>`;

/** Một đoạn; mảng thì mỗi phần tử một dòng. `small`: chữ 14 px; `muted`: chữ mờ; `last`: không cách dưới. */
export function para(lines: string | readonly string[], opts: { small?: boolean; muted?: boolean; last?: boolean } = {}): string {
  const [size, lineHeight] = opts.small ? ([14, 22] as const) : ([15, 24] as const);
  const [cls, color] = opts.muted ? (["ink3", C.ink3] as const) : (["ink2", C.ink2] as const);
  const text = (typeof lines === "string" ? [lines] : lines).map(escapeHtml).join("<br>");
  return `<p class="${cls}" style="margin:0 0 ${opts.last ? 0 : 14}px;font-size:${size}px;line-height:${lineHeight}px;color:${color};">${text}</p>`;
}

/** Link tới một trang của website (href ghép từ SITE_URL trong mã, không lấy từ dữ liệu của khách). */
export const linkPara = (href: string, label: string) =>
  `<p style="margin:0 0 14px;font-size:14px;line-height:22px;"><a href="${escapeHtml(href)}" style="color:${C.brand};text-decoration:none;font-weight:600;">${escapeHtml(label)} →</a></p>`;

/** Ô key: key chữ đơn cách (một lần chạm chọn cả key) và dòng "Gói **Monthly** · Hết hạn **22/11/2026**". */
export function keyBox(key: string, details: readonly (readonly [string, string])[]): string {
  const line = details
    .map(([label, value]) => `${escapeHtml(label)} <b class="ink" style="color:${C.ink};">${escapeHtml(value)}</b>`)
    .join(" &nbsp;·&nbsp; ");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr><td class="keybox" align="center" style="background:${C.brandSoft};border:1px solid ${C.lineStrong};border-radius:10px;padding:16px 14px;">
<div class="key" style="font-family:${MONO};font-size:19px;font-weight:600;letter-spacing:1.2px;color:${C.brandInk};-webkit-user-select:all;user-select:all;">${escapeHtml(key)}</div>
<div class="ink2" style="margin-top:8px;font-size:13px;line-height:20px;color:${C.ink2};">${line}</div>
</td></tr></table>`;
}

/** Các bước đánh số trong vòng tròn (phần ngôn ngữ của khách). */
export function stepList(title: string, steps: readonly string[]): string {
  const rows = steps
    .map(
      (t, i) =>
        `<tr><td valign="top" style="padding:0 12px 10px 0;width:24px;"><div class="num" style="width:24px;height:24px;border-radius:12px;background:${C.brandSoft};color:${C.brandInk};font-size:13px;font-weight:700;line-height:24px;text-align:center;">${i + 1}</div></td><td class="ink" valign="top" style="padding:2px 0 10px;font-size:15px;line-height:21px;color:${C.ink};">${escapeHtml(t)}</td></tr>`,
    )
    .join("\n");
  return `<p class="ink" style="margin:8px 0 12px;font-size:15px;line-height:22px;font-weight:700;color:${C.ink};">${escapeHtml(title)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">${rows}</table>`;
}

/** Các bước gọn "1. … 2. … 3. …" (phần tiếng Anh ở dưới). */
export function compactSteps(title: string, steps: readonly string[]): string {
  const body = [`<b class="ink" style="color:${C.ink};">${escapeHtml(title)}</b>`, ...steps.map((t, i) => `${i + 1}. ${escapeHtml(t)}`)].join("<br>");
  return `<p class="ink2" style="margin:0 0 14px;font-size:14px;line-height:22px;color:${C.ink2};">${body}</p>`;
}

/** Một câu trả lời của hỗ trợ: giữ nguyên văn và xuống dòng như người vận hành gõ. */
export const replyBox = (text: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr><td class="soft ink" style="background:${C.bg};border:1px solid ${C.line};border-radius:10px;padding:14px 16px;font-size:15px;line-height:23px;color:${C.ink};white-space:pre-wrap;">${escapeHtml(text)}</td></tr></table>`;
