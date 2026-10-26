// Thời lượng video demo đọc từ chính file MP4 (spec 2026-10-22-website-ja-zh-ko §4): nhãn "0:40" của nút phát, câu mô tả và
// `duration` của VideoObject không gõ tay, nên dựng lại video là số tự đúng. Không dùng thư viện: chỉ đọc hộp moov › mvhd.
import { readFileSync } from "node:fs";

/** Tìm hộp con `type` trong khoảng [start, end) của `buf`; trả { body, end } hay null. */
function findBox(buf, start, end, type) {
  for (let at = start; at + 8 <= end; ) {
    let size = buf.readUInt32BE(at);
    let head = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(at + 8));
      head = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < head) return null;
    if (buf.toString("latin1", at + 4, at + 8) === type) return { body: at + head, end: at + size };
    at += size;
  }
  return null;
}

/** Thời lượng (ms) ghi trong hộp mvhd của một file MP4. */
export function mp4DurationMs(buf) {
  const moov = findBox(buf, 0, buf.length, "moov");
  if (!moov) throw new Error("MP4 không có hộp moov");
  const mvhd = findBox(buf, moov.body, moov.end, "mvhd");
  if (!mvhd) throw new Error("MP4 không có hộp mvhd");
  const b = mvhd.body;
  const [timescale, duration] = buf[b] === 1 ? [buf.readUInt32BE(b + 20), Number(buf.readBigUInt64BE(b + 24))] : [buf.readUInt32BE(b + 12), buf.readUInt32BE(b + 16)];
  return Math.round((duration / timescale) * 1000);
}

/** Hai video demo của trang chủ (spec 2026-10-26-tach-video-demo-hai-phan): dịch cuộc họp và Gõ dịch; tên nằm trong tên file. */
export const VIDEO_KINDS = ["meeting", "typing"];

/** Kiểm `kind` là một trong VIDEO_KINDS (nơi gọi nào cũng cần trước khi ghép tên file). */
export function checkVideoKind(kind) {
  if (!VIDEO_KINDS.includes(kind)) throw new Error(`kind phải là ${VIDEO_KINDS.join(" hoặc ")}, nhận ${kind}`);
  return kind;
}

/** Thời lượng video `kind` của ngôn ngữ `lang` (src/assets/video/ai-translator-<kind>.<lang>.mp4): số giây làm tròn, "m:ss", "PT…S". */
export function videoMeta(lang, kind) {
  checkVideoKind(kind);
  const ms = mp4DurationMs(readFileSync(new URL(`../assets/video/ai-translator-${kind}.${lang}.mp4`, import.meta.url)));
  const seconds = Math.round(ms / 1000);
  return { seconds, clock: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, iso: `PT${seconds}S` };
}
