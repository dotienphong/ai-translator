// Chữ gửi tới Zalo của chủ dự án (spec 2026-10-22 §2.3–2.5): văn bản thuần, tiếng Việt, tối đa 2000 ký tự mỗi tin.
// Email của khách không bao giờ có ở đây: không hàm nào nhận email (test support-webhook khóa điều này từ đầu tới cuối).
import type { Conversation, RecentConversation } from "./store";
import { truncate, ZALO_MAX_TEXT } from "./text";

const SOURCE_LABEL = { web: "web", app: "app", "app-debug": "app (debug)" } as const;

type Header = Pick<Conversation, "code" | "source" | "lang" | "page" | "context">;

/** Dòng mở đầu của tin đầu tiên mỗi cuộc chat. */
export function headerLine(conv: Header): string {
  return [`🆕 #${conv.code}`, SOURCE_LABEL[conv.source], conv.lang, conv.page, conv.context]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" · ");
}

/** Một tin của khách như chủ dự án thấy trong Zalo. */
export function customerText(conv: Header, text: string, first: boolean): string {
  return truncate(first ? `${headerLine(conv)}\n${text}` : `#${conv.code} ${text}`, ZALO_MAX_TEXT);
}

export function ago(seconds: number): string {
  if (seconds < 60) return "vừa xong";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  return `${Math.floor(seconds / 86400)} ngày trước`;
}

/** Trả lời lệnh /ds. */
export function listText(rows: RecentConversation[], now: number): string {
  if (rows.length === 0) return "Không có cuộc chat nào trong 7 ngày qua.";
  const lines = rows.map((r) => {
    const marks = `${r.has_email ? " ✉️" : ""}${r.status === "blocked" ? " ⛔" : ""}`;
    const preview = r.last_text === null ? "" : ` · "${truncate(r.last_text.replace(/\s+/g, " "), 30)}"`;
    return `#${r.code} · ${SOURCE_LABEL[r.source]} · ${ago(now - r.last_activity_at)}${marks}${preview}`;
  });
  return truncate(["Cuộc chat 7 ngày qua:", ...lines].join("\n"), ZALO_MAX_TEXT);
}

export const HELP_TEXT = [
  "Trả lời khách: #MÃ nội dung (ví dụ: #K7Q Chào bạn…). Không ghi mã thì tin tới cuộc chat duy nhất vừa nhắn trong 30 phút qua.",
  "/ds: các cuộc chat 7 ngày qua",
  "/chan #MÃ: chặn cuộc chat (tin của khách đó không chuyển tới nữa)",
  "/mo #MÃ: bỏ chặn",
  "/tat, /bat: tắt hay bật chat trên website và app",
].join("\n");

/** Các câu bot trả lời chủ dự án. */
export const BOT_TEXT = {
  textOnly: "Chỉ gửi được chữ.",
  badCode: "Không đọc được mã. Ghi # và 3 ký tự của cuộc chat ở đầu tin, ví dụ: #K7Q nội dung (gõ /ds để xem mã). Tin này chưa được gửi.",
  emptyReply: "Thiếu nội dung sau mã.",
  noneRecent: "Không có cuộc chat nào nhắn trong 30 phút qua. Ghi mã ở đầu tin, ví dụ: #K7Q nội dung",
  ambiguous: (codes: string[]) =>
    `⚠️ Có ${codes.length} cuộc chat vừa nhắn trong 30 phút qua (${codes.map((c) => `#${c}`).join(", ")}). Ghi mã ở đầu tin, ví dụ: #${codes[0] ?? "K7Q"} nội dung`,
  delivered: (code: string) => `✓ đã gửi tới #${code}`,
  noSuchCode: (code: string) => `Không có cuộc chat #${code}.`,
  blocked: (code: string) => `#${code} đang bị chặn (gõ /mo #${code} để mở).`,
  blockedOk: (code: string) => `Đã chặn #${code}: tin của khách này không chuyển tới nữa.`,
  unblockedOk: (code: string) => `Đã bỏ chặn #${code}.`,
  needCode: (command: string) => `Thiếu mã, ví dụ: ${command} #K7Q`,
  turnedOff: "Đã TẮT chat trên website và app. Khách thấy email support@ thay ô nhập. Gõ /bat để bật lại.",
  turnedOn: "Đã BẬT chat trên website và app.",
  emailSaved: (code: string) => `#${code} ✉️ khách đã để lại email`,
  deleted: (code: string) => `#${code} 🗑 khách đã xóa cuộc chat`,
} as const;
