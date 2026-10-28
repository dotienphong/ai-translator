import type { SpeakerLabel, SpeakerVoice, Subtitle } from "./ipc";

// Phân biệt người nói ở giao diện (spec 2026-10-26-phan-biet-nguoi-noi §8): bảng giọng của phiên, giọng của từng dòng, dòng đầu mỗi
// lượt nói. Không chờ gì từ phía Rust: dòng chưa có giọng (hay giọng chưa có trong bảng) vẽ như khi tắt tính năng.

// Tên tối đa 40 ký tự (spec §8.2; `speakers::MAX_NAME_CHARS` ở phía Rust).
export const MAX_SPEAKER_NAME = 40;

// Bảng giọng theo mã. Đối tượng của giọng không đổi được giữ nguyên tham chiếu (`mergeVoices`), để các dòng memo của giọng đó không
// vẽ lại khi giọng khác đổi tên.
export type VoiceMap = ReadonlyMap<number, SpeakerVoice>;
export const NO_VOICES: VoiceMap = new Map();

function sameVoice(a: SpeakerVoice, b: SpeakerVoice): boolean {
  return (
    a.id === b.id &&
    a.label === b.label &&
    a.color === b.color &&
    a.source === b.source &&
    a.room === b.room &&
    a.mergedInto === b.mergedInto
  );
}

// Bảng mới (`speaker://roster`) ghép vào bảng cũ: giọng không đổi giữ đối tượng cũ; không có gì đổi thì trả đúng bảng cũ.
export function mergeVoices(prev: VoiceMap, next: readonly SpeakerVoice[]): VoiceMap {
  let changed = prev.size !== next.length;
  const out = new Map<number, SpeakerVoice>();
  for (const v of next) {
    const old = prev.get(v.id);
    if (old && sameVoice(old, v)) {
      out.set(v.id, old);
    } else {
      out.set(v.id, v);
      changed = true;
    }
  }
  return changed ? out : prev;
}

// Giọng của một phụ đề đã phát vừa đổi (`subtitle://speaker`): chỉ dòng đó đổi đối tượng; không có dòng đó hay giọng không đổi thì
// giữ nguyên mảng.
export function setSpeaker(lines: Subtitle[], label: SpeakerLabel): Subtitle[] {
  const i = lines.findIndex((l) => l.id === label.id);
  if (i < 0 || lines[i]?.speaker === label.speaker) return lines;
  return lines.map((l, j) => (j === i ? { ...l, speaker: label.speaker } : l));
}

// Khóa lượt nói: giọng đã gộp tay tính như giọng đích.
function turnKey(voice: SpeakerVoice | null): number | null {
  return voice === null ? null : (voice.mergedInto ?? voice.id);
}

export interface Decorated<T> {
  item: T;
  voice: SpeakerVoice | null;
  // Dòng đầu của lượt nói: tên có màu (thanh phụ đề), nhãn dạng chip (bản chép lời).
  turnStart: boolean;
}

// Gắn giọng và cờ "dòng đầu lượt nói" (spec §8.1, §8.2) cho các dòng theo thứ tự vẽ. Dòng chưa xác định không có giọng; dòng có
// giọng sau nó luôn là dòng đầu lượt (QĐ 6 của kế hoạch 03: thà lặp tên còn hơn để người đọc đoán).
export function decorate<T>(items: readonly T[], speakerOf: (item: T) => number | null, voices: VoiceMap): Decorated<T>[] {
  let previous: number | null = null;
  return items.map((item) => {
    const id = speakerOf(item);
    const voice = id === null ? null : (voices.get(id) ?? null);
    const key = turnKey(voice);
    const turnStart = key !== null && key !== previous;
    previous = key;
    return { item, voice, turnStart };
  });
}

// Biến CSS màu của giọng: bảng 8 màu ở `overlay.css` (nền tối của thanh) và `tokens.css` (cửa sổ chính, sáng và tối) (QĐ 1).
export function speakerColor(color: number): string {
  return `var(--spk-${((Math.trunc(color) % 8) + 8) % 8})`;
}

// Tên chèn vào giữa câu (tiêu đề "Đổi tên “…”", nhãn cho trình đọc màn hình): bọc trong FSI…PDI (U+2068, U+2069) để chữ viết từ
// phải sang trái hay ký tự định dạng lạ trong tên không đảo phần chữ quanh nó (QĐ 11 của kế hoạch 03; rà soát B-N8).
export function isolateName(name: string): string {
  return `⁨${name}⁩`;
}
