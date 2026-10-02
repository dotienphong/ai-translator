import type { AppStatus, BackgroundColor, Subtitle, TextColor } from "./ipc";

// Cách hiện một phụ đề theo trạng thái (spec §4.4, §6.6), dùng chung cho thanh phụ đề và bản chép lời.
// - `done`: bản dịch (câu gốc chữ nhỏ ở trên nếu bật "hiện câu gốc").
// - `translating`: chữ dịch đang tới dần; chưa có chữ nào thì hiện câu gốc màu nhạt.
// - `asr_done`: đã có câu gốc, chờ dịch: câu gốc màu nhạt.
// - `same_lang`, `skipped`: chỉ câu gốc (câu đã là ngôn ngữ đích; bỏ bước dịch vì trễ).
// - `failed`: câu gốc, kèm nhãn "chưa dịch được".
// - `dropped`: "[bỏ qua đoạn]".
export type LineKind = "translated" | "translating" | "pending" | "sourceOnly" | "failed" | "dropped";

export interface LineView {
  kind: LineKind;
  // Chữ chính của dòng (rỗng với `dropped`: giao diện hiện nhãn i18n).
  main: string;
  // Câu gốc chữ nhỏ ở trên, khi bật "hiện câu gốc" và dòng chính là bản dịch.
  source: string | null;
  // Phụ đề tạm (§6.3): màu nhạt hơn.
  provisional: boolean;
}

export function lineView(s: Subtitle, showSource: boolean): LineView {
  const provisional = s.provisional;
  const translated = (kind: LineKind): LineView => ({
    kind,
    main: s.tgt_text,
    source: showSource ? s.src_text : null,
    provisional,
  });
  const sourceOnly = (kind: LineKind): LineView => ({ kind, main: s.src_text, source: null, provisional });
  switch (s.status) {
    case "done":
      return s.tgt_text ? translated("translated") : sourceOnly("sourceOnly");
    case "translating":
      return s.tgt_text ? translated("translating") : sourceOnly("pending");
    case "asr_done":
      return sourceOnly("pending");
    case "same_lang":
    case "skipped":
      return sourceOnly("sourceOnly");
    case "failed":
      return sourceOnly("failed");
    case "dropped":
      return { kind: "dropped", main: "", source: null, provisional };
  }
}

// Giờ địa phương `HH:MM:SS` của mốc `unixMs`, với độ lệch múi giờ `offsetMinutes` (dương ở phía đông).
export function clockTime(unixMs: number, offsetMinutes: number): string {
  const d = new Date(unixMs + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// Ngày giờ địa phương `YYYY-MM-DD HH:MM`.
export function dateTime(unixMs: number, offsetMinutes: number): string {
  const d = new Date(unixMs + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Độ lệch múi giờ của máy tại thời điểm `at` (giờ Unix, ms), theo cách phía Rust nhận (`utcOffsetMinutes`). Bản chép lời
// dùng thời điểm bắt đầu phiên, để phiên ghi ở mùa giờ khác (giờ mùa hè) vẫn đúng giờ (N4 của review 03).
export function localOffsetMinutes(at: number = Date.now()): number {
  return -new Date(at).getTimezoneOffset();
}

// Bảng màu của phụ đề (§4.3, Cài đặt › Phụ đề). Mọi màu chữ đọc được trên mọi màu nền (tương phản ít nhất 4,5:1 khi nền
// đặc, §6.10); chữ còn có viền tối cho lúc nền gần trong suốt.
export const TEXT_COLORS: Record<TextColor, string> = {
  white: "#ffffff",
  yellow: "#ffd60a",
  green: "#4ade80",
  lightBlue: "#7dd3fc",
  orange: "#fb923c",
};

export const BACKGROUND_COLORS: Record<BackgroundColor, string> = {
  black: "#000000",
  darkGray: "#262626",
  navy: "#0c1b3a",
  darkBrown: "#342112",
  darkPurple: "#2e1046",
};

// Nền của thanh phụ đề: màu nền đã chọn với độ mờ `opacity` (0 là trong suốt hẳn).
export function overlayBackground(background: BackgroundColor, opacity: number): string {
  const hex = BACKGROUND_COLORS[background] ?? BACKGROUND_COLORS.black;
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Mức âm lượng (RMS) từ chừng này trở lên là "đang nghe thấy tiếng" (khoảng −50 dBFS).
export const HEARING_RMS = 0.003;

// Lời nhắc nhỏ trên thanh phụ đề (§4.2, §4.4, §9), theo thứ tự ưu tiên; khóa i18n là `overlay.note.<tên>`.
export type OverlayNote =
  | "firstRun"
  | "loading"
  | "quotaExhausted"
  | "error"
  | "noAudio"
  | "waitingForApp"
  | "lagging"
  | "translationUnavailable";

export function overlayNotes(status: AppStatus | null): OverlayNote[] {
  if (!status) return [];
  const notes: OverlayNote[] = [];
  if (status.loading === "firstRun") notes.push("firstRun");
  else if (status.loading === "model") notes.push("loading");
  if (status.session === "error") notes.push(status.sessionError === "quotaExhausted" ? "quotaExhausted" : "error");
  if (status.session === "running") {
    if (status.indicators.noAudio) notes.push("noAudio");
    if (status.waitingForApp) notes.push("waitingForApp");
    if (status.indicators.lagging) notes.push("lagging");
    if (status.indicators.translationUnavailable) notes.push("translationUnavailable");
  }
  return notes;
}
