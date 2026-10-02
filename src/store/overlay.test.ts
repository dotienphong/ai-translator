import { describe, expect, it, vi } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { AppStatus, OverlayView, Subtitle } from "../lib/ipc";
import { appendDelta, createOverlayStore, upsertLine } from "./overlay";

const sub = (id: number, tgt: string, provisional = false): Subtitle => ({
  id,
  start_ms: id * 1000,
  end_ms: id * 1000 + 800,
  src_lang: "en",
  src_text: `src ${id}`,
  tgt_text: tgt,
  status: "done",
  provisional,
  replaces: [],
});

const view: OverlayView = { uiLanguage: "vi", fontSize: 22, lines: 2, opacity: 0.6, showSource: false, locked: false };

describe("upsertLine", () => {
  it("thêm dòng mới vào cuối, giữ tối đa max dòng", () => {
    const lines = [sub(1, "a"), sub(2, "b")];
    expect(upsertLine(lines, sub(3, "c"), 2).map((l) => l.id)).toEqual([2, 3]);
  });

  it("phụ đề đã trôi khỏi thanh thì bỏ qua, không gắn vào cuối", () => {
    const lines = [sub(5, "e"), sub(6, "f")];
    expect(upsertLine(lines, sub(4, "d"), 2).map((l) => l.id)).toEqual([5, 6]);
    expect(upsertLine(lines, sub(4, "d"), 3).map((l) => l.id)).toEqual([5, 6]);
  });

  it("phụ đề chưa có trên thanh được chèn theo thứ tự id", () => {
    const lines = [sub(1, "a"), sub(3, "c")];
    expect(upsertLine(lines, sub(2, "b"), 3).map((l) => l.id)).toEqual([1, 2, 3]);
    expect(upsertLine(lines, sub(2, "b"), 2).map((l) => l.id)).toEqual([2, 3]);
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

describe("gộp câu và chữ dịch tới dần", () => {
  it("phụ đề có replaces thì xóa các phụ đề đã gộp vào nó (§7)", () => {
    const lines = [sub(1, "a"), sub(2, "b"), sub(3, "c")];
    const merged = { ...sub(4, "b c"), replaces: [2, 3] };
    expect(upsertLine(lines, merged, 3).map((l) => l.id)).toEqual([1, 4]);
  });

  // S1 của review 02 lần 2, đúng thứ tự sự kiện của `a_full_translation_queue_merges_the_waiting_subtitles` (engine):
  // câu 1–4 hiện, câu 5 hiện, rồi câu 2 gộp câu 3–4 (`replaces`), mang id 2 nhỏ hơn câu 5 đang hiện.
  it("phụ đề gộp vào đúng chỗ dòng đầu tiên bị thay, kể cả khi id nhỏ hơn dòng đầu còn lại", () => {
    let lines: Subtitle[] = [];
    for (const id of [1, 2, 3, 4, 5]) lines = upsertLine(lines, sub(id, `${id}`), 3);
    expect(lines.map((l) => l.id)).toEqual([3, 4, 5]);
    const merged = { ...sub(2, "Hai. Ba. Bốn."), replaces: [3, 4] };
    lines = upsertLine(lines, merged, 3);
    expect(lines.map((l) => [l.id, l.tgt_text])).toEqual([
      [2, "Hai. Ba. Bốn."],
      [5, "5"],
    ]);
    // Bản dịch xong của câu gộp (không còn `replaces` nào đang hiện) thay tại chỗ.
    lines = upsertLine(lines, { ...merged, tgt_text: "xong" }, 3);
    expect(lines.map((l) => [l.id, l.tgt_text])).toEqual([
      [2, "xong"],
      [5, "5"],
    ]);
  });

  it("delta nối vào chữ dịch của đúng phụ đề, phụ đề đã trôi khỏi thanh thì bỏ qua", () => {
    const lines = [sub(1, "Xin"), sub(2, "")];
    const next = appendDelta(appendDelta(lines, { id: 1, text: " chào" }), { id: 9, text: "x" });
    expect(next.map((l) => l.tgt_text)).toEqual(["Xin chào", ""]);
  });
});

const status = (session: AppStatus["session"], rev: number): AppStatus => ({
  session,
  overlayVisible: true,
  hotkeyFailures: [],
  loading: null,
  sessionError: null,
  cpuFallback: false,
  suggestLite: false,
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
  permissionSuspected: false,
  waitingForApp: false,
  pro: true,
  rev,
});

describe("overlay store", () => {
  it("phiên mới bắt đầu thì xóa phụ đề của phiên trước; trạng thái cũ tới muộn thì bỏ", async () => {
    const fake = fakeIpc({ get_overlay_view: () => ({ ...view, lines: 3 }) });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    fake.emit("app://status", status("starting", 1));
    fake.emit("app://status", status("running", 2));
    fake.emit("subtitle://upsert", sub(1, "một"));
    fake.emit("app://status", status("idle", 3));
    expect(store.getState().lines.map((l) => l.id)).toEqual([1]);
    // Trạng thái `starting` cũ (rev 1) tới muộn: không xóa gì.
    fake.emit("app://status", status("starting", 1));
    expect(store.getState().lines.map((l) => l.id)).toEqual([1]);
    expect(store.getState().status?.rev).toBe(3);
    fake.emit("app://status", status("starting", 4));
    expect(store.getState().lines).toEqual([]);
    fake.emit("app://status", status("running", 5));
    fake.emit("subtitle://upsert", sub(1_000_001, "hai"));
    expect(store.getState().lines.map((l) => l.id)).toEqual([1_000_001]);
  });

  it("đọc phần cài đặt của thanh phụ đề và nhận phụ đề qua sự kiện", async () => {
    const fake = fakeIpc({ get_overlay_view: () => view });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view).toEqual(view);
    fake.emit("subtitle://upsert", sub(1, "một"));
    fake.emit("subtitle://upsert", sub(2, "hai"));
    fake.emit("subtitle://upsert", sub(3, "b"));
    fake.emit("subtitle://delta", { id: 3, text: "a" });
    expect(store.getState().lines.map((l) => l.id)).toEqual([2, 3]);
    expect(store.getState().lines[1]?.tgt_text).toBe("ba");
    fake.emit("overlay://view", { ...view, lines: 1, locked: true });
    expect(store.getState().view?.locked).toBe(true);
    expect(store.getState().lines.map((l) => l.id)).toEqual([3]);
    expect(fake.calls.map((c) => c.cmd)).toEqual(["get_overlay_view"]);
  });

  it("cài đặt tới qua sự kiện trong lúc chờ get_overlay_view thì init không ghi đè", async () => {
    let fake: ReturnType<typeof fakeIpc> | null = null;
    fake = fakeIpc({
      get_overlay_view: () => {
        fake?.emit("overlay://view", { ...view, lines: 1, fontSize: 30 });
        return view;
      },
    });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view?.fontSize).toBe(30);
  });

  it("đọc xong cài đặt thì cắt các phụ đề đã tới trước đó theo số dòng", async () => {
    let release: (v: OverlayView) => void = () => {};
    const fake = fakeIpc({ get_overlay_view: () => new Promise<OverlayView>((resolve) => (release = resolve)) });
    const store = createOverlayStore(fake.ipc);
    const ready = store.getState().init();
    await vi.waitFor(() => expect(fake.calls.map((c) => c.cmd)).toEqual(["get_overlay_view"]));
    for (const id of [1, 2, 3]) fake.emit("subtitle://upsert", sub(id, `${id}`));
    release(view);
    await ready;
    expect(store.getState().lines.map((l) => l.id)).toEqual([2, 3]);
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
