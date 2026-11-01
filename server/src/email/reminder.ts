// Thư nhắc gia hạn trước 3 ngày (spec 2026-11-02-nhac-gia-han-qua-email-design.md). Cùng khung, màu và quy tắc với thư key (layout.ts):
// bảng lồng, kiểu inline, không ảnh, không theo dõi mở thư; phần ngôn ngữ của khách ở trên, phần tiếng Anh ở dưới (app tiếng Anh
// thì chỉ tiếng Anh). Khác thư key ở một điểm: có link "Ngừng nhận" trỏ về API (không phải SITE_URL).
import type { Lang } from "../lang";
import { PLAN_NAMES, type PlanCode } from "../plans";
import {
  C,
  compactSteps,
  END_ROW,
  emailPage,
  englishRow,
  escapeHtml,
  eyebrow,
  mainRow,
  para,
  RULE_ROW,
  subheading,
} from "./layout";
import { REMINDER, REMINDER_EN_BELOW } from "./reminder-strings";
import { MAIL, SITE_URL } from "./strings";
import type { Email } from "./templates";

export interface ExpiryReminderInput {
  lang: Lang;
  plan: PlanCode;
  licenseKey: string;
  /** Hạn của license (giây Unix). */
  expiresAt: number;
  /** Số ngày còn lại, làm tròn lên, 1–3. */
  daysLeft: number;
  /** Loại tiền của giá gia hạn (loại tiền của đơn gần nhất của license) và giá theo đơn vị nhỏ nhất (VND không có đơn vị lẻ, USD là cent). */
  currency: string;
  price: number;
  /** Số ngày một đơn gia hạn cộng thêm (days_per_order của gói). */
  addDays: number;
  /** Link ngừng nhận (có mã ký), đã dựng sẵn. */
  unsubscribeUrl: string;
}

/** CSS thêm cho thư này: ô lịch, nhãn và nút ở hộp thư tối; nút rộng hết khổ ở màn hình hẹp. */
const EXTRA_CSS = [
  "@media (max-width:600px){.btnt{width:100%!important}.btnt a{display:block!important}}",
  "@media (prefers-color-scheme:dark){.tilebody{background:#0c1322!important;border-color:#2b3b5c!important}.badge{background:#3a2a10!important;color:#ffc470!important}.btn a{color:#ffffff!important}}",
].join("\n");

const WARN = { bg: "#fff4e5", ink: "#9a4a00" };
const MONO = "'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

const pad2 = (n: number) => String(n).padStart(2, "0");
const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);

/** Ngày theo giờ Việt Nam (UTC+7, không đổi theo mùa), như thư key. */
function vnDate(epochSeconds: number): { y: number; m: number; d: number } {
  const t = new Date((epochSeconds + 7 * 3600) * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Giá hiển thị: VND dạng 500.000₫ trong thư tiếng Việt, "VND 500,000" ở các thư khác; USD dạng $39.99. */
export function priceText(lang: Lang, currency: string, amount: number): string {
  if (currency === "USD") return `$${(amount / 100).toFixed(2)}`;
  if (currency === "VND") return lang === "vi" ? `${group(amount, ".")}₫` : `VND ${group(amount, ",")}`;
  return `${amount} ${currency}`;
}

const calendarTile = (month: string, day: string) =>
  `<table role="presentation" width="76" cellpadding="0" cellspacing="0" border="0" style="width:76px;border-collapse:separate;">
<tr><td align="center" bgcolor="${C.brand}" style="background:${C.brand};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;line-height:24px;border-radius:10px 10px 0 0;">${escapeHtml(month)}</td></tr>
<tr><td class="tilebody ink" align="center" style="background:${C.card};border:1px solid ${C.lineStrong};border-top:0;border-radius:0 0 10px 10px;font-size:34px;font-weight:700;line-height:50px;color:${C.ink};">${escapeHtml(day)}</td></tr>
</table>`;

const checkRow = (text: string) =>
  `<tr><td valign="top" width="22" style="padding:0 0 8px;font-size:15px;line-height:21px;font-weight:700;color:${C.brand};">&#10003;</td><td class="ink2" valign="top" style="padding:0 0 8px;font-size:14px;line-height:21px;color:${C.ink2};">${escapeHtml(text)}</td></tr>`;

const stepRow = (n: number, html: string) =>
  `<tr><td valign="top" style="padding:0 12px 10px 0;width:24px;"><div class="num" style="width:24px;height:24px;border-radius:12px;background:${C.brandSoft};color:${C.brandInk};font-size:13px;font-weight:700;line-height:24px;text-align:center;">${n}</div></td><td class="ink" valign="top" style="padding:2px 0 10px;font-size:15px;line-height:21px;color:${C.ink};">${html}</td></tr>`;

/** Bước có chứa tên mục của app: in đậm đúng tên mục. */
function stepHtml(text: string, label: string): string {
  const at = text.indexOf(label);
  if (at < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, at))}<b>${escapeHtml(label)}</b>${escapeHtml(text.slice(at + label.length))}`;
}

export function expiryReminderEmail(input: ExpiryReminderInput): Email {
  const { lang, plan, licenseKey, expiresAt, daysLeft, currency, price, addDays, unsubscribeUrl } = input;
  const s = REMINDER[lang];
  const en = REMINDER.en;
  const below = lang !== "en";
  const planName = PLAN_NAMES[plan];
  const date = vnDate(expiresAt);
  const dateText = MAIL[lang].date(date.y, date.m, date.d);
  const dateEn = MAIL.en.date(date.y, date.m, date.d);
  const priceMain = priceText(lang, currency, price);
  const priceEn = priceText("en", currency, price);
  const guideUrl = `${SITE_URL}${MAIL[lang].guidePath}`;
  const guideUrlEn = `${SITE_URL}${MAIL.en.guidePath}`;
  const keyTail = `…${licenseKey.slice(-4)}`;

  const subject = below ? `${s.subject(planName, daysLeft)} / ${en.subject(planName, daysLeft)}` : en.subject(planName, daysLeft);
  const preheader = `${s.planTitle(planName)} · ${s.expiresOn} ${dateText}`;

  const infoCard = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>
<td width="76" valign="middle" style="width:76px;padding:0 16px 0 0;">${calendarTile(s.monthLabel(date.m), pad2(date.d))}</td>
<td valign="middle">
<div class="ink" style="font-size:17px;line-height:24px;font-weight:700;color:${C.ink};">${escapeHtml(s.planTitle(planName))}</div>
<div class="ink2" style="font-size:14px;line-height:22px;color:${C.ink2};">${escapeHtml(s.expiresOn)} <b class="ink" style="color:${C.ink};">${escapeHtml(dateText)}</b></div>
<div style="margin-top:8px;"><span class="badge" style="display:inline-block;background:${WARN.bg};color:${WARN.ink};font-size:12px;line-height:18px;font-weight:700;padding:2px 10px;border-radius:999px;">${escapeHtml(s.badge(daysLeft))}</span> <span class="ink3" style="font-family:${MONO};font-size:12px;color:${C.ink3};">&nbsp;${escapeHtml(s.keyLabel)} ${escapeHtml(keyTail)}</span></div>
</td></tr></table>`;

  const renewCard = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr><td class="soft" style="background:${C.bg};border:1px solid ${C.line};border-radius:12px;padding:16px 18px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr>
<td valign="bottom"><div class="ink" style="font-size:15px;line-height:22px;font-weight:700;color:${C.ink};">${escapeHtml(s.renewTitle(planName))}</div><div class="ink3" style="font-size:13px;line-height:20px;color:${C.ink3};">${escapeHtml(s.addDays(addDays))}</div></td>
<td align="right" valign="bottom" class="ink" style="font-size:22px;line-height:28px;font-weight:700;color:${C.ink};white-space:nowrap;">${escapeHtml(priceMain)}</td>
</tr></table>
<div class="rule" style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;margin:0 0 12px;">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${checkRow(s.checks[0])}${checkRow(s.checks[1])}</table>
</td></tr></table>`;

  // Nút là bảng một ô: nền đặt ở cả bgcolor lẫn style để Outlook cho Windows vẽ đúng.
  const button = `<table role="presentation" class="btnt" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr><td class="btn" align="center" bgcolor="${C.brand}" style="background:${C.brand};border-radius:10px;"><a href="${escapeHtml(guideUrl)}" style="display:inline-block;padding:13px 28px;font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(s.button)}</a></td></tr></table>`;

  const steps = `<p class="ink" style="margin:0 0 12px;font-size:15px;line-height:22px;font-weight:700;color:${C.ink};">${escapeHtml(s.stepsTitle)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">${s.steps.map((t, i) => stepRow(i + 1, stepHtml(t, s.upgradeLabel))).join("\n")}</table>`;

  const main = [
    eyebrow(s.eyebrow),
    `<h1 class="ink" style="margin:0 0 10px;font-size:22px;line-height:30px;font-weight:700;color:${C.ink};">${escapeHtml(s.heading(planName))}</h1>`,
    para(s.lead(daysLeft)),
    infoCard,
    renewCard,
    button,
    steps,
    para(s.help, { small: true, muted: true, last: true }),
  ];

  const english = [
    eyebrow("English"),
    subheading(REMINDER_EN_BELOW.heading(planName, daysLeft)),
    para(REMINDER_EN_BELOW.summary(dateEn), { small: true }),
    `<p class="ink2" style="margin:0 0 14px;font-size:14px;line-height:22px;color:${C.ink2};">${escapeHtml(planName)} · ${escapeHtml(REMINDER_EN_BELOW.expires)} <b class="ink" style="color:${C.ink};">${escapeHtml(dateEn)}</b><br>${escapeHtml(REMINDER_EN_BELOW.renewal(priceEn, addDays))}</p>`,
    compactSteps(en.stepsTitle, en.steps),
    `<p style="margin:0 0 14px;font-size:14px;line-height:22px;"><a href="${escapeHtml(guideUrlEn)}" style="color:${C.brand};text-decoration:none;font-weight:600;">${escapeHtml(REMINDER_EN_BELOW.guide)} →</a></p>`,
    para(en.help, { small: true, muted: true, last: true }),
  ];

  const rows = [mainRow(main.join("\n")), ...(below ? [RULE_ROW, englishRow(english.join("\n"))] : [END_ROW])];
  const unsubLink = (label: string) =>
    `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.ink3};text-decoration:underline;">${escapeHtml(label)}</a>`;
  const footerHtml = `${escapeHtml(s.footerReason)}<br>${unsubLink(s.unsubscribe)}${below ? ` · ${unsubLink(en.unsubscribe)}` : ""}`;
  const html = emailPage(lang, subject, preheader, rows.join("\n"), { extraCss: EXTRA_CSS, footerHtml });

  const text = [
    "AI Translator",
    "",
    s.heading(planName),
    s.lead(daysLeft),
    "",
    `    ${s.planTitle(planName)} · ${s.expiresOn} ${dateText} (${s.badge(daysLeft)})`,
    `    ${s.renewTitle(planName)}: ${priceMain} · ${s.addDays(addDays)}`,
    `    ${s.keyLabel} ${keyTail}`,
    "",
    `  - ${s.checks[0]}`,
    `  - ${s.checks[1]}`,
    "",
    `${s.button}: ${guideUrl}`,
    "",
    s.stepsTitle,
    ...s.steps.map((t, i) => `  ${i + 1}. ${t}`),
    "",
    s.help,
  ];
  if (below) {
    text.push(
      "",
      "─".repeat(28),
      "English",
      "",
      REMINDER_EN_BELOW.heading(planName, daysLeft),
      REMINDER_EN_BELOW.summary(dateEn),
      `  ${planName} · ${REMINDER_EN_BELOW.expires} ${dateEn}`,
      `  ${REMINDER_EN_BELOW.renewal(priceEn, addDays)}`,
      "",
      en.stepsTitle,
      ...en.steps.map((t, i) => `  ${i + 1}. ${t}`),
      `${REMINDER_EN_BELOW.guide}: ${guideUrlEn}`,
      en.help,
    );
  }
  text.push("", "--", s.footerReason, `${s.unsubscribe}: ${unsubscribeUrl}`);
  if (below) text.push(`${en.unsubscribe}: ${unsubscribeUrl}`);
  text.push("AI Translator · aitranslator.vn", "");
  return { subject, html, text: text.join("\n") };
}
