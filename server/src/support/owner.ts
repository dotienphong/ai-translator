// Đọc tin chủ dự án gõ cho bot: lệnh hay câu trả lời (spec 2026-10-22 §2.4, §2.5).

export type OwnerAction =
  | { kind: "reply"; code: string | null; text: string }
  | { kind: "block" | "unblock"; code: string | null }
  | { kind: "list" | "off" | "on" | "help" };

/** Mã ở đầu tin: `#` + 3 chữ hay số, sau đó là khoảng trắng hay hết tin. */
const CODE_AT_START = /^#([A-Za-z0-9]{3})(?=\s|$)([\s\S]*)$/;
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

export function parseOwnerText(raw: string): OwnerAction {
  const text = raw.trim();
  if (text.startsWith("/")) {
    const [command = "", arg = ""] = text.split(/\s+/);
    const name = command.normalize("NFC").toLowerCase();
    const kind = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
    if (kind === "block" || kind === "unblock") return { kind, code: CODE_ARG.exec(arg)?.[1]?.toUpperCase() ?? null };
    return kind === undefined ? { kind: "help" } : { kind };
  }
  const m = CODE_AT_START.exec(text);
  if (m) return { kind: "reply", code: (m[1] ?? "").toUpperCase(), text: (m[2] ?? "").trim() };
  return { kind: "reply", code: null, text };
}
