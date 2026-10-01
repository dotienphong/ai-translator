import { describe, expect, it, vi } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { OverlayView, Subtitle } from "../lib/ipc";
import { createOverlayStore, upsertLine } from "./overlay";

const sub = (id: number, tgt: string, provisional = false): Subtitle => ({
  id,
  start_ms: id * 1000,
  end_ms: id * 1000 + 800,
  src_lang: "en",
  src_text: `src ${id}`,
  tgt_text: tgt,
  status: "done",
  provisional,
});

const view: OverlayView = { uiLanguage: "vi", fontSize: 22, lines: 2, opacity: 0.6, showSource: false, locked: false };

describe("upsertLine", () => {
  it("thêm dòng mới vào cuối, giữ tối đa max dòng", () => {
    const lines = [sub(1, "a"), sub(2, "b")];
    expect(upsertLine(lines, sub(3, "c"), 2).map((l) => l.id)).toEqual([2, 3]);
  });

  it("phụ đề tạm cùng id được thay tại chỗ", () => {
    const lines = [sub(1, "a"), sub(2, "b", true)];
    const next = upsertLine(lines, sub(2, "b đã ghép"), 3);
    expect(next.map((l) => l.tgt_text)).toEqual(["a", "b đã ghép"]);
    expect(next[1]?.provisional).toBe(false);
  });

  it("thay tại chỗ cả dòng không nằm cuối, thứ tự giữ nguyên", () => {
    const lines = [sub(1, "a", true), sub(2, "b"), sub(3, "c")];
    const next = upsertLine(lines, sub(1, "a đã ghép"), 3);
    expect(next.map((l) => [l.id, l.tgt_text])).toEqual([
      [1, "a đã ghép"],
      [2, "b"],
      [3, "c"],
    ]);
  });
});

describe("overlay store", () => {
  it("đọc phần cài đặt của thanh phụ đề và nhận phụ đề qua sự kiện", async () => {
    const fake = fakeIpc({ get_overlay_view: () => view });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view).toEqual(view);
    fake.emit("subtitle://upsert", sub(1, "một"));
    fake.emit("subtitle://upsert", sub(2, "hai"));
    fake.emit("subtitle://upsert", sub(3, "ba"));
    expect(store.getState().lines.map((l) => l.id)).toEqual([2, 3]);
    fake.emit("overlay://view", { ...view, lines: 1, locked: true });
    expect(store.getState().view?.locked).toBe(true);
    expect(store.getState().lines.map((l) => l.id)).toEqual([3]);
    expect(fake.calls.map((c) => c.cmd)).toEqual(["get_overlay_view"]);
  });

  it("phụ đề tới trước khi đọc xong cài đặt thì giữ mặc định 3 dòng", async () => {
    let release: (v: OverlayView) => void = () => {};
    const fake = fakeIpc({ get_overlay_view: () => new Promise<OverlayView>((resolve) => (release = resolve)) });
    const store = createOverlayStore(fake.ipc);
    const ready = store.getState().init();
    await vi.waitFor(() => expect(fake.calls.map((c) => c.cmd)).toEqual(["get_overlay_view"]));
    for (const id of [1, 2, 3, 4]) fake.emit("subtitle://upsert", sub(id, `${id}`));
    expect(store.getState().view).toBeNull();
    expect(store.getState().lines.map((l) => l.id)).toEqual([2, 3, 4]);
    release(view);
    await ready;
  });
});
