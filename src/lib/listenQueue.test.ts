import { describe, expect, test } from "vitest";
import type { Subtitle } from "./ipc";
import { type Queue, clear, dequeue, enqueue, skipToLatest } from "./listenQueue";

const line = (id: number, text = `câu ${id}`): Subtitle => ({
  id,
  start_ms: 0,
  end_ms: 1,
  src_lang: "en",
  src_text: "x",
  tgt_text: text,
  status: "done",
  provisional: false,
  replaces: [],
  speaker: null,
});

const empty: Queue = { items: [], seen: new Set() };

describe("listen queue", () => {
  test("keeps the order lines arrived in", () => {
    let q = enqueue(empty, line(1), 10);
    q = enqueue(q, line(2), 20);
    q = enqueue(q, line(3), 30);
    const [a, q1] = dequeue(q);
    const [b, q2] = dequeue(q1);
    const [c, q3] = dequeue(q2);
    expect([a?.id, b?.id, c?.id]).toEqual([1, 2, 3]);
    expect(q3.items).toEqual([]);
  });

  test("carries the text and the arrival time", () => {
    const [item] = dequeue(enqueue(empty, line(5, "xin chào"), 123));
    expect(item).toEqual({ id: 5, text: "xin chào", since: 123 });
  });

  test("ignores a line id it has already seen", () => {
    let q = enqueue(empty, line(1), 1);
    q = enqueue(q, line(1, "bản sửa"), 2);
    expect(q.items).toHaveLength(1);
    const [, rest] = dequeue(q);
    // Đã đọc xong câu 1 rồi mà nó tới lại (cập nhật phụ đề): vẫn không đọc lần hai.
    expect(enqueue(rest, line(1), 3).items).toEqual([]);
  });

  test("skip keeps only the newest line", () => {
    let q = enqueue(empty, line(1), 1);
    q = enqueue(q, line(2), 2);
    q = enqueue(q, line(3), 3);
    expect(skipToLatest(q).items.map((i) => i.id)).toEqual([3]);
  });

  test("skip on an empty or one-line queue changes nothing", () => {
    expect(skipToLatest(empty)).toEqual(empty);
    const one = enqueue(empty, line(1), 1);
    expect(skipToLatest(one).items.map((i) => i.id)).toEqual([1]);
  });

  test("clear empties the queue but remembers what was seen, so old lines never replay", () => {
    let q = enqueue(empty, line(1), 1);
    q = enqueue(q, line(2), 2);
    const cleared = clear(q);
    expect(cleared.items).toEqual([]);
    expect(enqueue(cleared, line(1), 3).items).toEqual([]);
    expect(enqueue(cleared, line(3), 3).items.map((i) => i.id)).toEqual([3]);
  });

  test("dequeue on an empty queue returns null and the same queue", () => {
    const [item, q] = dequeue(empty);
    expect(item).toBeNull();
    expect(q).toEqual(empty);
  });

  test("functions never mutate their input", () => {
    const q = enqueue(empty, line(1), 1);
    const snapshot = JSON.stringify({ items: q.items, seen: [...q.seen] });
    enqueue(q, line(2), 2);
    dequeue(q);
    skipToLatest(q);
    clear(q);
    expect(JSON.stringify({ items: q.items, seen: [...q.seen] })).toBe(snapshot);
  });
});
