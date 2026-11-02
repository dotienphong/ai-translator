import type { Subtitle } from "./ipc";

// Hàng đợi đọc của "Nghe dịch" (spec 2026-11-02-nghe-dich-truc-tiep §6): đọc hết từng câu theo thứ tự tới. Hàm thuần: không đổi đầu vào.

export interface QueuedLine {
  id: number;
  text: string;
  // Lúc câu vào hàng (ms), để tính tuổi khi chờ nhãn giọng.
  since: number;
}

export interface Queue {
  items: readonly QueuedLine[];
  // Mọi id đã từng vào hàng: câu tới lại (phụ đề cập nhật) hay đã bị xóa khỏi hàng cũng không đọc lần hai.
  seen: ReadonlySet<number>;
}

export function enqueue(q: Queue, line: Subtitle, now: number): Queue {
  if (q.seen.has(line.id)) return q;
  return {
    items: [...q.items, { id: line.id, text: line.tgt_text, since: now }],
    seen: new Set([...q.seen, line.id]),
  };
}

export function dequeue(q: Queue): [QueuedLine | null, Queue] {
  const [first, ...rest] = q.items;
  return first === undefined ? [null, q] : [first, { items: rest, seen: q.seen }];
}

// "Bỏ qua": bỏ phần dồn, giữ đúng câu mới nhất.
export function skipToLatest(q: Queue): Queue {
  const last = q.items[q.items.length - 1];
  return last === undefined || q.items.length === 1 ? q : { items: [last], seen: q.seen };
}

// Tắt "Nghe dịch": xóa hàng nhưng nhớ đã thấy gì, để câu cũ không bị đọc lại khi bật lại.
export function clear(q: Queue): Queue {
  return { items: [], seen: q.seen };
}
