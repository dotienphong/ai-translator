import type { CaptureMode, Subtitle } from "./ipc";
import type { VoiceMap } from "./speakers";
import { canSpeakLang } from "./tts";

// Quy tắc nguồn của "Nghe dịch" (spec 2026-11-02-nghe-dich-truc-tiep §6): chỉ đọc bản dịch của tiếng máy (khách nói), không đọc lời
// người dùng (micro). Nhãn nguồn từng đoạn chỉ nằm trong bộ nhận giọng, nên overlay dùng thứ nó đã có: chế độ thu và cờ `room`
// (giọng có từ 60% thời lượng từ micro) của bảng người nói.

// Câu chưa có nhãn giọng được giữ chừng này (ms) chờ nhãn; hết hạn mà vẫn chưa có thì đọc (ưu tiên không mất ý khách).
export const LABEL_WAIT_MS = 1500;
// Khớp giới hạn của lõi (`tts::MAX_TEXT_BYTES`).
export const MAX_TEXT_BYTES = 4000;

export type Decision = "read" | "skip" | "wait";

// `ageMs`: câu đã chờ bao lâu kể từ lúc chốt xong.
export function decide(line: Subtitle, voices: VoiceMap, mode: CaptureMode, ageMs: number): Decision {
  if (mode === "playback") return "read";
  if (mode === "mic") return "skip";
  const voice = line.speaker === null ? undefined : voices.get(line.speaker);
  if (voice === undefined) return ageMs < LABEL_WAIT_MS ? "wait" : "read";
  // Giọng đã gộp tay: tính theo giọng đích.
  const target = voice.mergedInto === null ? voice : (voices.get(voice.mergedInto) ?? voice);
  return target.room ? "skip" : "read";
}

const encoder = new TextEncoder();

// Câu dịch đã chốt (không phải bản tạm, không lỗi), có chữ, đủ ngắn để đọc, và ngôn ngữ đích có giọng đọc.
export function isReadable(line: Subtitle, targetLang: string): boolean {
  if (line.status !== "done" || line.provisional || !canSpeakLang(targetLang)) return false;
  const text = line.tgt_text;
  return text.trim().length > 0 && encoder.encode(text).length <= MAX_TEXT_BYTES;
}
