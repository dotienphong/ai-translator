import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { GlossaryEntry, SessionSummary, Transcript } from "../lib/ipc";
import { createAppStore } from "./app";
import { createGlossaryStore, createHistoryStore, resetWhenDataCleared } from "./library";

const summary = (id: number): SessionSummary => ({
  id,
  startedAt: id * 1000,
  endedAt: id * 1000 + 60_000,
  targetLang: "vi",
  lines: 3,
  preview: `câu ${id}`,
});
const transcript: Transcript = { session: 0, startedAt: 1000, endedAt: 61_000, targetLang: "vi", lines: [] };

describe("history store", () => {
  it("đọc danh sách, mở một phiên, xóa phiên đang mở thì đóng nó, xóa tất cả", async () => {
    const fake = fakeIpc({
      list_history: () => [summary(2), summary(1)],
      get_history_session: () => transcript,
      delete_history_session: () => null,
      clear_history: () => 1,
    });
    const store = createHistoryStore(fake.ipc);
    await store.getState().load();
    expect(store.getState().sessions?.map((s) => s.id)).toEqual([2, 1]);
    await store.getState().openSession(2);
    expect(store.getState().open).toEqual({ id: 2, transcript });
    await store.getState().remove(2);
    expect(store.getState().open).toBeNull();
    expect(store.getState().sessions?.map((s) => s.id)).toEqual([1]);
    await store.getState().clearAll();
    expect(store.getState().sessions).toEqual([]);
    expect(store.getState().error).toBeNull();
  });

  it("gói Free: lỗi proRequired, danh sách giữ null", async () => {
    const fake = fakeIpc({
      list_history: () => {
        throw { code: "proRequired", field: null, message: "…" };
      },
    });
    const store = createHistoryStore(fake.ipc);
    await store.getState().load();
    expect(store.getState().error).toEqual({ code: "proRequired", field: null });
    expect(store.getState().sessions).toBeNull();
  });
});

describe("glossary store", () => {
  function setup() {
    let entries: GlossaryEntry[] = [{ id: 1, source: "API", target: "giao diện" }];
    let next = 2;
    const fake = fakeIpc({
      list_glossary: () => entries,
      add_glossary_entry: ({ source, target }) => {
        if (source.toLowerCase() === "api") throw { code: "glossaryDuplicate", field: "source", message: "…" };
        const entry = { id: next++, source, target };
        entries = [...entries, entry];
        return entry;
      },
      update_glossary_entry: ({ id, source, target }) => ({ id, source, target }),
      delete_glossary_entry: () => null,
      import_glossary_csv: () => {
        entries = [...entries, { id: 9, source: "sprint", target: "đợt chạy" }];
        return { added: 1, updated: 0, skipped: 2, overLimit: 0 };
      },
      export_glossary_csv: () => "/tmp/glossary.csv",
    });
    return { fake, store: createGlossaryStore(fake.ipc) };
  }

  it("thêm, sửa, xóa; lỗi của ô nhập trả về cho dòng đang sửa", async () => {
    const { store } = setup();
    await store.getState().load();
    expect(await store.getState().add("Api", "x")).toEqual({ code: "glossaryDuplicate", field: "source" });
    expect(store.getState().error).toBeNull();
    expect(await store.getState().add("sprint", "đợt chạy")).toBeNull();
    expect(await store.getState().update(1, "API", "giao diện lập trình")).toBeNull();
    expect(store.getState().entries?.map((e) => [e.id, e.target])).toEqual([
      [1, "giao diện lập trình"],
      [2, "đợt chạy"],
    ]);
    await store.getState().remove(1);
    expect(store.getState().entries?.map((e) => e.id)).toEqual([2]);
  });

  it("nhập CSV thì báo kết quả và đọc lại danh sách; xuất CSV báo đường dẫn", async () => {
    const { store } = setup();
    await store.getState().load();
    await store.getState().importCsv();
    expect(store.getState().report).toEqual({ added: 1, updated: 0, skipped: 2, overLimit: 0 });
    expect(store.getState().entries?.map((e) => e.id)).toEqual([1, 9]);
    await store.getState().exportCsv();
    expect(store.getState().exported).toBe("/tmp/glossary.csv");
    expect(store.getState().report).toBeNull();
    store.getState().dismiss();
    expect(store.getState().exported).toBeNull();
  });

  it("bấm Hủy ở hộp thoại thì không đổi gì", async () => {
    const fake = fakeIpc({
      list_glossary: () => [],
      import_glossary_csv: () => null,
      export_glossary_csv: () => null,
    });
    const store = createGlossaryStore(fake.ipc);
    await store.getState().load();
    await store.getState().importCsv();
    await store.getState().exportCsv();
    expect(store.getState().report).toBeNull();
    expect(store.getState().exported).toBeNull();
    expect(fake.calls.map((c) => c.cmd)).toEqual(["list_glossary", "import_glossary_csv", "export_glossary_csv"]);
  });
});

describe("xóa toàn bộ dữ liệu (N2 của review 03)", () => {
  it("xóa xong thì lịch sử và từ điển đang hiện cũng mất; xóa lỗi thì giữ", async () => {
    let fail = true;
    const fake = fakeIpc({
      list_history: () => [summary(1)],
      list_glossary: () => [{ id: 1, source: "sprint", target: "sprint" }],
      clear_all_data: () => {
        if (fail) throw { code: "dataUnavailable", field: null, message: "…" };
        return null;
      },
      get_debug_sessions: () => [],
    });
    const app = createAppStore(fake.ipc);
    const history = createHistoryStore(fake.ipc);
    const glossary = createGlossaryStore(fake.ipc);
    await history.getState().load();
    await glossary.getState().load();
    const off = resetWhenDataCleared(app, [history, glossary]);
    await app.getState().clearAllData();
    expect(history.getState().sessions).toHaveLength(1);
    expect(glossary.getState().entries).toHaveLength(1);
    fail = false;
    await app.getState().clearAllData();
    expect(history.getState().sessions).toEqual([]);
    expect(glossary.getState().entries).toEqual([]);
    // Đọc lại sau khi xóa, rồi store app đổi việc khác: không xóa lần nữa (chỉ lúc vừa xóa xong).
    await history.getState().load();
    await app.getState().loadDebugSessions();
    expect(history.getState().sessions).toHaveLength(1);
    off();
  });
});
