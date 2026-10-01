import { describe, expect, it } from "vitest";
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
});
