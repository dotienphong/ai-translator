// Nội dung email chứa license key, song ngữ vi/en (§4.5). Chỉ gửi văn bản thuần.
// Tên sản phẩm là "AI Translator" (spec D13, chốt 2026-10-01).
import { formatLicenseKey } from "../license-key";

export const PRODUCT_NAME = "AI Translator";

export type LicenseEmailKind = "purchase" | "renewal" | "plan_change" | "recover" | "resend";

export interface LicenseEmailEntry {
  licenseKey: string;
  /** Tên hiển thị của gói (src/plans.ts, PLAN_NAMES). */
  planName: string;
  expiresAt: number;
}

function dateVi(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Giờ Việt Nam (UTC+7), không đổi theo mùa.
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
}

const SUBJECTS: Record<LicenseEmailKind, string> = {
  purchase: `License key ${PRODUCT_NAME} / Your ${PRODUCT_NAME} license key`,
  renewal: `Đã gia hạn ${PRODUCT_NAME} / ${PRODUCT_NAME} renewed`,
  plan_change: `Đã đổi gói ${PRODUCT_NAME} / ${PRODUCT_NAME} plan changed`,
  recover: `License key ${PRODUCT_NAME} của bạn / Your ${PRODUCT_NAME} license keys`,
  resend: `License key ${PRODUCT_NAME} / Your ${PRODUCT_NAME} license key`,
};

export function licenseEmail(kind: LicenseEmailKind, entries: LicenseEmailEntry[]): { subject: string; text: string } {
  const lines = entries.map(
    (e) => `  ${formatLicenseKey(e.licenseKey)}  (${e.planName}, hết hạn / expires ${dateVi(e.expiresAt)})`,
  );
  const text = [
    `Cảm ơn bạn đã dùng ${PRODUCT_NAME}.`,
    "",
    "License key:",
    ...lines,
    "",
    "Mở app, vào Cài đặt > Bản quyền, dán key để kích hoạt. Mỗi key dùng trên 1 máy.",
    "Giữ email này để kích hoạt máy khác hoặc cài lại máy.",
    "",
    "---",
    `Thank you for using ${PRODUCT_NAME}.`,
    "Open the app, go to Settings > License and paste the key. Each key works on 1 computer.",
    "Keep this email to activate another computer or reinstall.",
  ].join("\n");
  return { subject: SUBJECTS[kind], text };
}

/**
 * Thư gửi câu trả lời của hỗ trợ cho khách đã rời khung chat (chat hỗ trợ, spec 2026-10-22 §2.6). Song ngữ vi/en như thư key;
 * câu trả lời giữ nguyên văn chủ dự án gõ. Khách trả lời thư thì về support@ (Reply-To của Resend).
 */
export function supportReplyEmail(replies: string[]): { subject: string; text: string } {
  return {
    subject: `Trả lời từ hỗ trợ ${PRODUCT_NAME} / Reply from ${PRODUCT_NAME} support`,
    text: [
      `Bộ phận hỗ trợ ${PRODUCT_NAME} đã trả lời tin nhắn của bạn.`,
      `${PRODUCT_NAME} support has replied to your message.`,
      "",
      replies.join("\n\n"),
      "",
      "---",
      "Bạn có thể trả lời thư này, hoặc mở lại khung chat trên aitranslator.io.vn hay mục Hỗ trợ trong app.",
      "You can reply to this email, or reopen the chat on aitranslator.io.vn or in the app's Support screen.",
    ].join("\n"),
  };
}
