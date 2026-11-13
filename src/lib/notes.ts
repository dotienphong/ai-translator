import type { MessageKey, Params } from "../i18n";
import type { Notes, Settings, Subtitle } from "./ipc";
import type { NotesPackState } from "./models";

// Các quyết định thuần của màn hình "Ghi chú cuộc họp" (spec 2026-11-11-ghi-chu-cuoc-hop-design.md mục 2, 6, 7, 9): nguồn
// của ghi chú, bước kế tiếp khi bấm Tạo, sửa mục, và tra câu gốc. Không đọc store, không gọi IPC.

export type Translate = (key: MessageKey, params?: Params) => string;

export type CloudProvider = "openai" | "gemini" | "deepseek";
export type NotesSource = { kind: "local" } | { kind: "cloud"; provider: CloudProvider; model: string };

const PROVIDER_NAME: Record<CloudProvider, string> = { openai: "ChatGPT", gemini: "Gemini", deepseek: "DeepSeek" };

// Nguồn của ghi chú đi theo nguồn dịch (Cài đặt > Model), không có cài đặt riêng. Cài đặt chưa nạp thì coi là Local: không đoán
// một nhà cung cấp cloud.
export function sourceOf(
  s: Pick<Settings, "translationProvider" | "openaiModel" | "geminiModel" | "deepseekModel">,
): NotesSource {
  switch (s.translationProvider) {
    case "openai":
      return { kind: "cloud", provider: "openai", model: s.openaiModel ?? "" };
    case "gemini":
      return { kind: "cloud", provider: "gemini", model: s.geminiModel ?? "" };
    case "deepseek":
      return { kind: "cloud", provider: "deepseek", model: s.deepseekModel ?? "" };
    default:
      return { kind: "local" };
  }
}

// "Model trên máy" (không nêu tên model Local), hay "ChatGPT · gpt-4o-mini".
export function sourceLabel(source: NotesSource, t: Translate): string {
  if (source.kind === "local") return t("notes.source.local");
  const name = PROVIDER_NAME[source.provider];
  return source.model === "" ? name : `${name} · ${source.model}`;
}

export interface GateInput {
  source: NotesSource;
  // `ModelsView.notes.state`.
  pack: NotesPackState;
  // `settings.notesLocalAck`.
  localAck: boolean;
  // `settings.notesCloudConsent`.
  cloudConsent: boolean;
  // Có API key của nhà cung cấp đang chọn.
  hasKey: boolean;
  // Phiên dịch đang starting hay running.
  sessionActive: boolean;
  // Mục tiêu là phiên hiện tại.
  isCurrent: boolean;
  lineCount: number;
  pro: boolean;
  // `NotesView.freeLeft`.
  freeLeft: number | null;
  existing: "none" | "generated" | "edited";
}

export type AskDialog = "localSuggest" | "cloudConsent" | "overwrite" | "overwriteEdited";

export type Gate =
  | {
      kind: "blocked";
      reason:
        | "empty"
        | "sessionRunning"
        | "localSessionActive"
        | "freeUsedUp"
        | "localUnavailable"
        | "packMissing"
        | "packDownloading"
        | "keyMissing";
    }
  | { kind: "ask"; dialog: AskDialog }
  | { kind: "go" };

// Bước kế tiếp khi người dùng bấm Tạo. Luật đầu tiên khớp thì trả; `confirmed` là các hộp người dùng đã xác nhận trong lần bấm này.
export function gate(input: GateInput, confirmed: ReadonlySet<AskDialog>): Gate {
  const blocked = (reason: Extract<Gate, { kind: "blocked" }>["reason"]): Gate => ({ kind: "blocked", reason });
  const ask = (dialog: AskDialog): Gate => ({ kind: "ask", dialog });
  if (input.lineCount === 0) return blocked("empty");
  if (input.isCurrent && input.sessionActive) return blocked("sessionRunning");
  if (!input.pro && input.freeLeft === 0) return blocked("freeUsedUp");
  if (input.source.kind === "local") {
    if (input.pack === "unavailable" || input.pack === "ramTooLow") return blocked("localUnavailable");
    if (input.pack === "missing") return blocked("packMissing");
    if (input.pack === "downloading") return blocked("packDownloading");
    if (input.sessionActive) return blocked("localSessionActive");
    if (!input.localAck && !confirmed.has("localSuggest")) return ask("localSuggest");
  } else {
    if (!input.hasKey) return blocked("keyMissing");
    if (!input.cloudConsent && !confirmed.has("cloudConsent")) return ask("cloudConsent");
  }
  if (input.existing === "edited" && !confirmed.has("overwriteEdited")) return ask("overwriteEdited");
  if (input.existing === "generated" && !confirmed.has("overwrite")) return ask("overwrite");
  return { kind: "go" };
}

// Xuất Markdown, TXT là tính năng Pro; sao chép thì mọi gói.
export function canExportFile(pro: boolean): boolean {
  return pro;
}

type ItemKey = "decisions" | "actionItems" | "openQuestions";

// Sửa (`patch`) hay xóa (`null`) mục thứ `index` của một khối, không đổi bản gốc. Chỉ số ngoài khoảng: trả lại chính `notes`.
export function withItem<K extends ItemKey>(
  notes: Notes,
  key: K,
  index: number,
  patch: Partial<Notes[K][number]> | null,
): Notes {
  const list = notes[key] as readonly Notes[K][number][];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return notes;
  const next =
    patch === null ? list.filter((_, i) => i !== index) : list.map((item, i) => (i === index ? { ...item, ...patch } : item));
  return { ...notes, [key]: next };
}

// `refs` là số thứ tự từ 1 của câu trong bản chép lời. Trả các câu tìm thấy theo đúng thứ tự `refs`; số không có câu thì bỏ.
export function linesForRefs(lines: readonly Subtitle[], refs: readonly number[]): { seq: number; line: Subtitle }[] {
  const found: { seq: number; line: Subtitle }[] = [];
  for (const seq of refs) {
    const line = Number.isInteger(seq) && seq >= 1 ? lines[seq - 1] : undefined;
    if (line) found.push({ seq, line });
  }
  return found;
}
