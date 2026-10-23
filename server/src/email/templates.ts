// Thư gửi khách: thư license key và thư trả lời chat hỗ trợ, viết bằng ngôn ngữ app của khách, phần tiếng Anh ở dưới (app tiếng
// Anh thì chỉ tiếng Anh). Mỗi thư có bản HTML (layout.ts) và bản chữ thuần cùng nội dung (spec 2026-10-23-email-theo-ngon-ngu-design.md).
import type { Lang } from "../lang";
import { formatLicenseKey } from "../license-key";
import {
  compactSteps,
  END_ROW,
  emailPage,
  englishRow,
  eyebrow,
  heading,
  keyBox,
  linkPara,
  mainRow,
  para,
  RULE_ROW,
  replyBox,
  stepList,
  subheading,
} from "./layout";
import { EN_BELOW, type LicenseEmailKind, MAIL, type MailStrings, pick, SITE_URL } from "./strings";

export type { LicenseEmailKind } from "./strings";

export interface LicenseEmailEntry {
  licenseKey: string;
  /** Tên hiển thị của gói (src/plans.ts, PLAN_NAMES), giữ tiếng Anh ở mọi ngôn ngữ như giao diện app. */
  planName: string;
  expiresAt: number;
}

export interface Email {
  subject: string;
  html: string;
  text: string;
}

/**
 * Ngôn ngữ thư (spec 2026-10-23 §1, D2): ngôn ngữ app đã biết; không có (app ≤ 0.2.4, key cấp tay) thì đơn USD ra tiếng Anh, còn
 * lại tiếng Việt (Việt trên, Anh dưới, như thư trước đợt này).
 */
export function mailLang(lang: Lang | null, currency: string | null): Lang {
  if (lang) return lang;
  return currency === "USD" ? "en" : "vi";
}

/** Thư mua, lấy lại và gửi lại có các bước kích hoạt; thư gia hạn và đổi gói thì key giữ nguyên, không cần kích hoạt lại. */
const WITH_STEPS: ReadonlySet<LicenseEmailKind> = new Set<LicenseEmailKind>(["purchase", "recover", "resend"]);
const RULE_TEXT = "─".repeat(28);
const FOOTER_TEXT = ["", "--", "AI Translator · aitranslator.io.vn", ""];

/** Ngày hết hạn theo giờ Việt Nam (UTC+7, không đổi theo mùa), viết theo ngôn ngữ. */
function dateIn(s: MailStrings, epochSeconds: number): string {
  const vn = new Date((epochSeconds + 7 * 3600) * 1000);
  return s.date(vn.getUTCFullYear(), vn.getUTCMonth() + 1, vn.getUTCDate());
}

const guideUrl = (s: MailStrings) => `${SITE_URL}${s.guidePath}`;
const numbered = (steps: readonly string[]) => steps.map((t, i) => `  ${i + 1}. ${t}`);

export function licenseEmail(lang: Lang, kind: LicenseEmailKind, entries: readonly LicenseEmailEntry[]): Email {
  const s = MAIL[lang];
  const en = MAIL.en;
  const n = entries.length;
  const below = lang !== "en";
  const steps = WITH_STEPS.has(kind);
  const subject = below ? `${pick(s.subject[kind], n)} / ${pick(en.subject[kind], n)}` : pick(en.subject[kind], n);
  const enLines = entries.map((e) => `${e.planName} · ${en.expires} ${dateIn(en, e.expiresAt)}`);

  const main = [
    eyebrow(s.eyebrow.license),
    heading(pick(s.heading[kind], n)),
    para(pick(s.lead[kind], n)),
    ...entries.map((e) =>
      keyBox(formatLicenseKey(e.licenseKey), [
        [s.plan, e.planName],
        [s.expires, dateIn(s, e.expiresAt)],
      ]),
    ),
    steps ? stepList(s.stepsTitle, s.steps) : "",
    para(s.note, { small: true }),
    linkPara(guideUrl(s), s.guide),
    para(s.help, { small: true, muted: true, last: true }),
  ];
  const english = [
    eyebrow("English"),
    subheading(pick(en.heading[kind], n)),
    para(pick(EN_BELOW[kind], n), { small: true }),
    para(enLines, { small: true }),
    steps ? compactSteps(en.stepsTitle, en.steps) : "",
    para(en.note, { small: true }),
    linkPara(guideUrl(en), en.guide),
    para(en.help, { small: true, muted: true, last: true }),
  ];
  const rows = [mainRow(main.filter(Boolean).join("\n")), ...(below ? [RULE_ROW, englishRow(english.filter(Boolean).join("\n"))] : [END_ROW])];
  // Dòng xem trước hiện cả ở thông báo trên điện thoại, nên chỉ có gói và hạn, không có key.
  const first = entries[0];
  const preheader = first ? `${s.plan} ${first.planName} · ${s.expires} ${dateIn(s, first.expiresAt)}` : pick(s.lead[kind], n);

  const text = ["AI Translator", "", pick(s.heading[kind], n), pick(s.lead[kind], n), ""];
  entries.forEach((e, i) => {
    if (i > 0) text.push("");
    text.push(`    ${formatLicenseKey(e.licenseKey)}`, `    ${s.plan} ${e.planName} · ${s.expires} ${dateIn(s, e.expiresAt)}`);
  });
  text.push("");
  if (steps) text.push(s.stepsTitle, ...numbered(s.steps), "");
  text.push(s.note, `${s.guide}: ${guideUrl(s)}`, s.help);
  if (below) {
    text.push("", RULE_TEXT, "English", "", pick(en.heading[kind], n), pick(EN_BELOW[kind], n), ...enLines.map((l) => `  ${l}`), "");
    if (steps) text.push(en.stepsTitle, ...numbered(en.steps), "");
    text.push(en.note, `${en.guide}: ${guideUrl(en)}`, en.help);
  }
  text.push(...FOOTER_TEXT);
  return { subject, html: emailPage(lang, subject, preheader, rows.join("\n")), text: text.join("\n") };
}

/**
 * Thư gửi câu trả lời của hỗ trợ cho khách đã rời khung chat (chat hỗ trợ, spec 2026-10-22 §2.6), viết bằng ngôn ngữ của cuộc chat.
 * Câu trả lời giữ nguyên văn người vận hành gõ. Khách trả lời thư thì về support@ (Reply-To của Resend).
 */
export function supportReplyEmail(lang: Lang, replies: readonly string[]): Email {
  const s = MAIL[lang];
  const en = MAIL.en;
  const below = lang !== "en";
  const subject = below ? `${pick(s.subject.support, 1)} / ${pick(en.subject.support, 1)}` : pick(en.subject.support, 1);
  const main = [
    eyebrow(s.eyebrow.support),
    heading(pick(s.heading.support, 1)),
    para(pick(s.lead.support, 1)),
    ...replies.map(replyBox),
    para(s.supportOutro, { small: true, last: true }),
  ];
  const english = [
    eyebrow("English"),
    subheading(pick(en.heading.support, 1)),
    para(pick(EN_BELOW.support, 1), { small: true }),
    para(en.supportOutro, { small: true, last: true }),
  ];
  const rows = [mainRow(main.join("\n")), ...(below ? [RULE_ROW, englishRow(english.join("\n"))] : [END_ROW])];

  const text = ["AI Translator", "", pick(s.heading.support, 1), pick(s.lead.support, 1), ""];
  replies.forEach((r, i) => {
    if (i > 0) text.push("");
    text.push(...r.split(/\r\n?|\n/).map((l) => (l ? `  ${l}` : "")));
  });
  text.push("", s.supportOutro);
  if (below) text.push("", RULE_TEXT, "English", "", pick(en.heading.support, 1), pick(EN_BELOW.support, 1), en.supportOutro);
  text.push(...FOOTER_TEXT);
  return { subject, html: emailPage(lang, subject, pick(s.lead.support, 1), rows.join("\n")), text: text.join("\n") };
}
