// Thời gian tương đối ("2 giờ trước") kèm ngày giờ đầy đủ GMT+7 ở `title` (rê chuột) và dateTime ISO (máy đọc).
import { fmtAgo, fmtDateTime, isoOf } from "../format";

export function RelTime({ sec, now, className }: { sec: number; now: number; className?: string }) {
  return (
    <time dateTime={isoOf(sec)} title={fmtDateTime(sec)} className={className}>
      {fmtAgo(sec, now)}
    </time>
  );
}
