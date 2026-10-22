// Đọc tin chủ dự án gõ cho bot: lệnh hay câu trả lời (spec 2026-10-22 §2.4, §2.5).

export type OwnerAction =
  | { kind: "reply"; code: string | null; text: string }
  | { kind: "block" | "unblock"; code: string | null }
  | { kind: "list" | "off" | "on" | "help" }
  /** Tin bắt đầu bằng `#` mà không đọc được mã: bot báo lại, không gửi cho ai (tránh gửi nhầm khách). */
  | { kind: "badCode" };

/** Mã ở đầu tin: `#` + đúng 3 chữ hay số (không dính chữ hay số khác), rồi bỏ các dấu `: , . - – —` và khoảng trắng ngay sau mã. */
const CODE_AT_START = /^#([A-Za-z0-9]{3})(?![A-Za-z0-9])[\s:,.\-–—]*([\s\S]*)$/;
/** Mã làm tham số của lệnh, có hay không dấu `#`. */
const CODE_ARG = /^#?([A-Za-z0-9]{3})$/;
/** Lệnh và cách gõ có dấu tiếng Việt (bàn phím điện thoại hay tự thêm dấu). */
const COMMANDS: Record<string, "list" | "block" | "unblock" | "off" | "on"> = {
  "/ds": "list",
  "/chan": "block",
  "/chặn": "block",
  "/mo": "unblock",
  "/mở": "unblock",
  "/tat": "off",
  "/tắt": "off",
  "/bat": "on",
  "/bật": "on",
};

/** Ký tự định dạng (Unicode Cf: rộng 0, đánh dấu chiều chữ, gạch nối mềm…) và khoảng trắng ở đầu tin: bàn phím và ứng dụng chat hay chèn, bỏ trước khi nhận dạng. */
const LEADING_INVISIBLE = /^[\p{Cf}\s]+/u;

/** Phần của `original` còn lại sau khi đã dùng hết `consumed` ký tự của dạng NFKC (đi từng ký tự gốc, để không NFKC nội dung). */
function afterNormalizedPrefix(original: string, consumed: number): string {
  let used = 0;
  let index = 0;
  for (const ch of original) {
    if (used >= consumed) break;
    used += ch.normalize("NFKC").length;
    index += ch.length;
  }
  return original.slice(index);
}

export function parseOwnerText(raw: string): OwnerAction {
  // `text` giữ nguyên văn (chỉ bỏ ký tự vô hình ở đầu); `head` (NFKC: ＃ toàn khổ thành #) chỉ dùng để nhận dạng lệnh và mã.
  const text = raw.replace(LEADING_INVISIBLE, "").trim();
  const head = text.normalize("NFKC");
  if (head.startsWith("/")) {
    const [command = "", arg = ""] = head.split(/\s+/);
    const name = command.normalize("NFC").toLowerCase();
    const kind = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
    if (kind === "block" || kind === "unblock") return { kind, code: CODE_ARG.exec(arg)?.[1]?.toUpperCase() ?? null };
    return kind === undefined ? { kind: "help" } : { kind };
  }
  const m = CODE_AT_START.exec(head);
  if (m) {
    const body = afterNormalizedPrefix(text, head.length - (m[2] ?? "").length);
    return { kind: "reply", code: (m[1] ?? "").toUpperCase(), text: body.trim() };
  }
  // Mọi tin bắt đầu bằng # còn lại là mã gõ sai: không được rơi xuống "cuộc chat duy nhất vừa nhắn".
  if (head.startsWith("#")) return { kind: "badCode" };
  return { kind: "reply", code: null, text };
}
