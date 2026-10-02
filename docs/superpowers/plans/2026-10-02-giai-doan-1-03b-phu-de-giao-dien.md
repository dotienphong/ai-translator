# Giai đoạn 1 · 03b: Phụ đề, bản chép lời, lịch sử, từ điển thuật ngữ — giao diện, thử tay, Windows

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần giao diện của kế hoạch 03 (mục 2.3 của kế hoạch 00) trên lõi Rust của 03a:
- thanh phụ đề đủ §4.4 (F3): 1–3 dòng, câu gốc tùy chọn, chữ dịch hiện dần, phụ đề tạm màu nhạt, chỉ báo đang nghe, không có âm thanh, đang trễ, lời nhắc nạp model và hết hạn mức, kéo cạnh đổi kích thước;
- màn hình Bản chép lời (F4: tìm, sao chép, xuất TXT, SRT, Markdown), Lịch sử và Từ điển thuật ngữ (F5), khóa ở gói Free;
- nhóm Cài đặt "Phụ đề" và "Quyền riêng tư";
- bước "Nghe thử" của lần đầu mở (§4.1 bước 6) và bảng debug ẩn (§7);
- thử tay trên Mac, đợt Windows, và cập nhật kế hoạch 00.

**Kiến trúc:** Logic của giao diện nằm ở `src/lib/` và `src/store/` (test bằng vitest, không cần DOM); component React chỉ vẽ. Mọi dữ liệu tới từ lệnh và sự kiện của 03a; không màn hình nào tự đoán trạng thái Pro hay tự dựng chữ để xuất file. Cửa sổ `overlay` vẫn chỉ đọc phần cài đặt của nó và nghe sự kiện (§10.2), cộng quyền kéo cạnh trên Windows.

**Công nghệ:** Giữ nguyên React 19.3, Zustand 5.0.15, Vite 8.3, TypeScript 7.0, vitest 5.0.3, `@tauri-apps/api` 2.12.1. Không thêm gói npm nào.

Làm sau khi 03a đã xong hẳn (03a Task 11 xanh). Bảng phiên bản, thứ tự với kế hoạch 04 và file giao nhau, dòng của bảng đối chiếu, quyết định (QĐ1–QĐ22), điểm cần chủ dự án quyết, kết quả mutation và bảng task → commit tham chiếu nằm ở 03a: `docs/superpowers/plans/2026-10-02-giai-doan-1-03a-phu-de-du-lieu.md`. Cách đọc các khối code, lệnh và Expected cũng như 03a.


---

## Task 1: Kiểu IPC, cách hiện phụ đề, store dữ liệu

Dòng 47, 48, 49, 65–67, 73, 81, 151–153, 292. Phần logic của giao diện, test bằng vitest (không cần DOM):

- `src/lib/ipc.ts`: kiểu và lệnh của 03a (`Transcript`, `TranscriptRef`, `SessionSummary`, `GlossaryEntry`, `ImportReport`, `DebugSession`; 16 lệnh mới).
- `src/lib/subtitleView.ts`: `lineView` (cách hiện một phụ đề theo trạng thái, dùng chung cho thanh phụ đề và bản chép lời), `overlayNotes` (lời nhắc của thanh phụ đề theo thứ tự ưu tiên), `clockTime`, `dateTime`, `localOffsetMinutes`, `HEARING_RMS`.
- `src/store/transcript.ts`: bản chép lời của phiên hiện tại trong cửa sổ chính: đọc `get_transcript` rồi theo sự kiện (không giới hạn số dòng; bản đọc tới muộn không thêm lại dòng đã gộp); tìm (NFC, không phân biệt hoa thường); sao chép và xuất qua phía Rust.
- `src/store/library.ts`: store của Lịch sử và Từ điển. Lỗi của ô nhập trả về cho dòng đang sửa.
- `src/store/app.ts`: `startListenTest`, `clearAllData`, `loadDebugSessions`. `src/store/overlay.ts`: mức âm lượng cho chỉ báo "đang nghe".

**Files:**
- Modify: `src/lib/ipc.ts`
- Create: `src/lib/subtitleView.test.ts`
- Create: `src/lib/subtitleView.ts`
- Modify: `src/store/app.test.ts`
- Modify: `src/store/app.ts`
- Create: `src/store/library.test.ts`
- Create: `src/store/library.ts`
- Modify: `src/store/overlay.test.ts`
- Modify: `src/store/overlay.ts`
- Create: `src/store/transcript.test.ts`
- Create: `src/store/transcript.ts`

- [ ] **Step 1: Viết test trước**

Tạo `src/lib/subtitleView.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AppStatus, Subtitle } from "./ipc";
import { clockTime, dateTime, lineView, localOffsetMinutes, overlayNotes } from "./subtitleView";

const sub = (status: Subtitle["status"], tgt = "", provisional = false): Subtitle => ({
  id: 1,
  start_ms: 0,
  end_ms: 1000,
  src_lang: "en",
  src_text: "Hello",
  tgt_text: tgt,
  status,
  provisional,
  replaces: [],
});

const status = (patch: Partial<AppStatus>): AppStatus => ({
  session: "running",
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
  rev: 1,
  ...patch,
});

describe("lineView", () => {
  it("bản dịch xong là dòng chính, câu gốc chỉ khi bật hiện câu gốc", () => {
    expect(lineView(sub("done", "Xin chào"), false)).toEqual({
      kind: "translated",
      main: "Xin chào",
      source: null,
      provisional: false,
    });
    expect(lineView(sub("done", "Xin chào"), true).source).toBe("Hello");
  });

  it("đang dịch: chữ dịch tới dần; chưa có chữ nào thì câu gốc màu nhạt", () => {
    expect(lineView(sub("translating", "Xin"), true)).toMatchObject({ kind: "translating", main: "Xin", source: "Hello" });
    expect(lineView(sub("translating"), true)).toMatchObject({ kind: "pending", main: "Hello", source: null });
    expect(lineView(sub("asr_done"), false)).toMatchObject({ kind: "pending", main: "Hello" });
  });

  it("cùng ngôn ngữ, bỏ bước dịch, dịch lỗi và đoạn bị bỏ", () => {
    expect(lineView(sub("same_lang"), true)).toMatchObject({ kind: "sourceOnly", main: "Hello", source: null });
    expect(lineView(sub("skipped"), true).kind).toBe("sourceOnly");
    expect(lineView(sub("failed"), true)).toMatchObject({ kind: "failed", main: "Hello" });
    expect(lineView(sub("dropped"), true)).toMatchObject({ kind: "dropped", main: "" });
    expect(lineView(sub("done"), false).kind).toBe("sourceOnly");
  });

  it("phụ đề tạm giữ cờ provisional", () => {
    expect(lineView(sub("done", "Xin chào", true), false).provisional).toBe(true);
  });
});

describe("giờ", () => {
  // 2026-10-02 07:05:09 UTC.
  const t = Date.UTC(2026, 9, 2, 7, 5, 9);

  it("giờ địa phương theo độ lệch múi giờ", () => {
    expect(clockTime(t, 7 * 60)).toBe("14:05:09");
    expect(clockTime(t, -9 * 60)).toBe("22:05:09");
    expect(dateTime(t, 7 * 60)).toBe("2026-10-02 14:05");
    expect(dateTime(t, -9 * 60)).toBe("2026-10-01 22:05");
  });

  it("độ lệch của máy ngược dấu với getTimezoneOffset", () => {
    expect(localOffsetMinutes({ getTimezoneOffset: () => -420 } as Date)).toBe(420);
  });
});

describe("overlayNotes", () => {
  it("không có trạng thái thì không có gì", () => {
    expect(overlayNotes(null)).toEqual([]);
  });

  it("đang nạp model, lần đầu, và các chỉ báo lúc đang dịch", () => {
    expect(overlayNotes(status({ session: "starting", loading: "model" }))).toEqual(["loading"]);
    expect(overlayNotes(status({ session: "starting", loading: "firstRun" }))).toEqual(["firstRun"]);
    expect(
      overlayNotes(
        status({
          waitingForApp: true,
          indicators: { lagging: true, noAudio: true, translationUnavailable: true },
        }),
      ),
    ).toEqual(["noAudio", "waitingForApp", "lagging", "translationUnavailable"]);
  });

  it("chỉ báo của phiên chỉ hiện khi đang dịch; lỗi và hết hạn mức hiện sau khi dừng", () => {
    expect(overlayNotes(status({ session: "idle", indicators: { lagging: true, noAudio: true, translationUnavailable: false } }))).toEqual([]);
    expect(overlayNotes(status({ session: "error", sessionError: "quotaExhausted" }))).toEqual(["quotaExhausted"]);
    expect(overlayNotes(status({ session: "error", sessionError: "sidecarFailed" }))).toEqual(["error"]);
  });
});
```

Sửa `src/store/app.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/app.test.ts b/src/store/app.test.ts
--- a/src/store/app.test.ts
+++ b/src/store/app.test.ts
@@ -74,6 +74,9 @@
       return { ...status, session: "running", overlayVisible: true, rev: 2 };
     },
     list_audio_sources: () => [{ kind: "app", bundleId: "us.zoom.xos", name: "zoom.us" }],
+    start_listen_test: () => ({ ...status, session: "running", overlayVisible: true, rev: 4 }),
+    clear_all_data: () => null,
+    get_debug_sessions: () => [],
     open_audio_permission_settings: () => null,
     set_overlay_locked: ({ locked }) => ({ ...settings, overlay: { ...settings.overlay, locked } }),
     open_login_items_settings: () => {
@@ -262,6 +265,19 @@
     expect(store.getState().error).toBeNull();
   });
 
+  it("nghe thử bắt đầu phiên riêng; xóa toàn bộ dữ liệu báo lại; đọc bảng debug", async () => {
+    const { fake, store } = setup();
+    await store.getState().init();
+    await store.getState().startListenTest();
+    expect(fake.calls.at(-1)?.cmd).toBe("start_listen_test");
+    expect(store.getState().status?.session).toBe("running");
+    await store.getState().clearAllData();
+    expect(store.getState().dataCleared).toBe(true);
+    expect(store.getState().debugSessions).toBeNull();
+    await store.getState().loadDebugSessions();
+    expect(store.getState().debugSessions).toEqual([]);
+  });
+
   it("thanh đo âm lượng theo dBFS: −60 dB trở xuống là 0, 0 dB là đầy", () => {
     expect(levelToMeter(0)).toBe(0);
     expect(levelToMeter(0.001)).toBe(0);
```

Tạo `src/store/library.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { GlossaryEntry, SessionSummary, Transcript } from "../lib/ipc";
import { createGlossaryStore, createHistoryStore } from "./library";

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
```

Sửa `src/store/overlay.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/overlay.test.ts b/src/store/overlay.test.ts
--- a/src/store/overlay.test.ts
+++ b/src/store/overlay.test.ts
@@ -123,6 +123,19 @@
     expect(store.getState().lines.map((l) => l.id)).toEqual([1_000_001]);
   });
 
+  it("mức âm lượng cho chỉ báo đang nghe, về 0 khi phiên dừng", async () => {
+    const fake = fakeIpc({ get_overlay_view: () => view });
+    const store = createOverlayStore(fake.ipc);
+    await store.getState().init();
+    fake.emit("app://status", status("running", 1));
+    fake.emit("audio://level", 0.02);
+    expect(store.getState().level).toBe(0.02);
+    fake.emit("app://status", status("running", 2));
+    expect(store.getState().level).toBe(0.02);
+    fake.emit("app://status", status("idle", 3));
+    expect(store.getState().level).toBe(0);
+  });
+
   it("đọc phần cài đặt của thanh phụ đề và nhận phụ đề qua sự kiện", async () => {
     const fake = fakeIpc({ get_overlay_view: () => view });
     const store = createOverlayStore(fake.ipc);
```

Tạo `src/store/transcript.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { AppStatus, Subtitle, Transcript } from "../lib/ipc";
import { createTranscriptStore, mergeSnapshot, searchLines, upsertAll } from "./transcript";

const sub = (id: number, tgt: string, src = `src ${id}`): Subtitle => ({
  id,
  start_ms: id * 1000,
  end_ms: id * 1000 + 800,
  src_lang: "en",
  src_text: src,
  tgt_text: tgt,
  status: "done",
  provisional: false,
  replaces: [],
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

const transcript = (lines: Subtitle[], session = 1): Transcript => ({
  session,
  startedAt: 1_000,
  endedAt: null,
  targetLang: "vi",
  lines,
});

describe("upsertAll, mergeSnapshot, searchLines", () => {
  it("không giới hạn số dòng, giữ thứ tự id, gộp thì bỏ dòng đã gộp", () => {
    let lines: Subtitle[] = [];
    for (const id of [3, 1, 2, 4]) lines = upsertAll(lines, sub(id, `${id}`));
    expect(lines.map((l) => l.id)).toEqual([1, 2, 3, 4]);
    lines = upsertAll(lines, { ...sub(2, "hai ba"), replaces: [3] });
    expect(lines.map((l) => [l.id, l.tgt_text])).toEqual([
      [1, "1"],
      [2, "hai ba"],
      [4, "4"],
    ]);
  });

  it("bản đọc từ phía Rust chỉ thêm dòng chưa có, không thêm lại dòng đã gộp đi", () => {
    const merged = mergeSnapshot([sub(2, "mới")], [sub(1, "a"), sub(2, "cũ"), sub(3, "c")], new Set([3]));
    expect(merged.map((l) => [l.id, l.tgt_text])).toEqual([
      [1, "a"],
      [2, "mới"],
    ]);
  });

  it("tìm trong câu gốc và bản dịch, không phân biệt hoa thường và dạng Unicode", () => {
    const lines = [sub(1, "Chào buổi sáng", "Good morning"), sub(2, "Hẹn gặp ở Đà Nẵng", "See you")];
    expect(searchLines(lines, "MORNING").map((l) => l.id)).toEqual([1]);
    expect(searchLines(lines, "đà nẵng".normalize("NFD")).map((l) => l.id)).toEqual([2]);
    expect(searchLines(lines, "  ").length).toBe(2);
    expect(searchLines(lines, "xyz")).toEqual([]);
  });
});

function setup(initial: Transcript) {
  let snapshot = initial;
  const copied: string[] = [];
  const fake = fakeIpc({
    get_transcript: () => snapshot,
    transcript_text: ({ utcOffsetMinutes }) => `TXT ${utcOffsetMinutes}`,
    export_transcript: ({ format }) => (format === "srt" ? null : `/tmp/x.${format}`),
  });
  const store = createTranscriptStore({
    ipc: fake.ipc,
    writeClipboard: async (text) => void copied.push(text),
    offsetMinutes: () => 420,
  });
  return { fake, store, copied, setSnapshot: (t: Transcript) => (snapshot = t) };
}

describe("transcript store", () => {
  it("đọc bản của phiên hiện tại rồi theo sự kiện phụ đề", async () => {
    const { fake, store } = setup(transcript([sub(1, "một")]));
    await store.getState().init();
    expect(store.getState().transcript?.lines.map((l) => l.id)).toEqual([1]);
    fake.emit("subtitle://upsert", { ...sub(2, ""), status: "translating" });
    fake.emit("subtitle://delta", { id: 2, text: "hai" });
    expect(store.getState().transcript?.lines.map((l) => l.tgt_text)).toEqual(["một", "hai"]);
  });

  it("phiên mới thì bắt đầu rỗng; chạy rồi thì đọc lại giờ bắt đầu, không thêm lại dòng đã gộp", async () => {
    const { fake, store, setSnapshot } = setup(transcript([sub(1, "một")]));
    await store.getState().init();
    fake.emit("app://status", status("starting", 2));
    expect(store.getState().transcript?.lines).toEqual([]);
    fake.emit("subtitle://upsert", sub(1_000_001, "a"));
    fake.emit("subtitle://upsert", { ...sub(1_000_002, "b c"), replaces: [1_000_003] });
    setSnapshot({ ...transcript([sub(1_000_001, "a"), sub(1_000_003, "c")], 2), startedAt: 9_000 });
    fake.emit("app://status", status("running", 3));
    await Promise.resolve();
    await Promise.resolve();
    const t = store.getState().transcript;
    expect(t?.startedAt).toBe(9_000);
    expect(t?.lines.map((l) => l.id)).toEqual([1_000_001, 1_000_002]);
  });

  it("sao chép qua phía Rust với độ lệch múi giờ, rồi báo đã sao chép", async () => {
    const { store, copied } = setup(transcript([]));
    await store.getState().init();
    await store.getState().copy({ kind: "current" });
    expect(copied).toEqual(["TXT 420"]);
    expect(store.getState().notice).toEqual({ kind: "copied" });
  });

  it("xuất file: báo đường dẫn; bấm Hủy thì không báo gì; lỗi Pro hiện mã lỗi", async () => {
    const { fake, store } = setup(transcript([]));
    await store.getState().init();
    await store.getState().exportTo({ kind: "current" }, "markdown", "translation");
    expect(store.getState().notice).toEqual({ kind: "exported", path: "/tmp/x.markdown" });
    expect(fake.calls.at(-1)?.args).toEqual({
      source: { kind: "current" },
      format: "markdown",
      srtText: "translation",
      utcOffsetMinutes: 420,
    });
    await store.getState().exportTo({ kind: "current" }, "srt", "source");
    expect(store.getState().notice).toBeNull();
    const refusing = fakeIpc({
      get_transcript: () => transcript([]),
      export_transcript: () => {
        throw { code: "proRequired", field: null, message: "…" };
      },
    });
    const locked = createTranscriptStore({ ipc: refusing.ipc, writeClipboard: async () => {} });
    await locked.getState().init();
    await locked.getState().exportTo({ kind: "current" }, "txt", "translation");
    expect(locked.getState().error).toEqual({ code: "proRequired", field: null });
    locked.getState().dismiss();
    expect(locked.getState().error).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
NO_COLOR=1 pnpm exec vitest run src/lib/subtitleView.test.ts src/store/transcript.test.ts src/store/library.test.ts src/store/app.test.ts src/store/overlay.test.ts 2>&1 | grep -E '^ FAIL |^Error:' | sed "s#$PWD/##g" | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có các module mới):
```text
 FAIL  src/lib/subtitleView.test.ts [ src/lib/subtitleView.test.ts ]
 FAIL  src/store/app.test.ts > app store > nghe thử bắt đầu phiên riêng; xóa toàn bộ dữ liệu báo lại; đọc bảng debug
 FAIL  src/store/library.test.ts [ src/store/library.test.ts ]
 FAIL  src/store/overlay.test.ts > overlay store > mức âm lượng cho chỉ báo đang nghe, về 0 khi phiên dừng
 FAIL  src/store/transcript.test.ts [ src/store/transcript.test.ts ]
Error: Cannot find module './library' imported from src/store/library.test.ts
```

- [ ] **Step 3: Viết code**

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/ipc.ts b/src/lib/ipc.ts
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -137,6 +137,69 @@
   text: string;
 }
 
+// Bản chép lời của một phiên (`transcript::store::Transcript`). `startedAt`, `endedAt`: giờ Unix (ms); `start_ms`,
+// `end_ms` của từng dòng tính từ `startedAt`. `session` là 0 với phiên đọc từ lịch sử.
+export interface Transcript {
+  session: number;
+  startedAt: number;
+  endedAt: number | null;
+  targetLang: string;
+  lines: Subtitle[];
+}
+
+// Bản chép lời nào: của phiên hiện tại (hoặc vừa dừng), hay một phiên trong lịch sử (`data::TranscriptRef`).
+export type TranscriptRef = { kind: "current" } | { kind: "history"; id: number };
+export type ExportFormat = "txt" | "srt" | "markdown";
+export type SrtText = "source" | "translation";
+
+// Một phiên trong Lịch sử (`transcript::history::SessionSummary`).
+export interface SessionSummary {
+  id: number;
+  startedAt: number;
+  endedAt: number;
+  targetLang: string;
+  lines: number;
+  preview: string;
+}
+
+// Một cặp thuật ngữ (`glossary::GlossaryEntry`) và kết quả nhập CSV (`glossary::ImportReport`).
+export interface GlossaryEntry {
+  id: number;
+  source: string;
+  target: string;
+}
+
+export interface ImportReport {
+  added: number;
+  updated: number;
+  skipped: number;
+  overLimit: number;
+}
+
+// Số đo của một phiên đã dừng, cho bảng debug ẩn (`debug::DebugSession`). Không có chữ chép lời.
+export interface DebugStage {
+  name: "vad" | "asr" | "mt" | "total";
+  count: number;
+  p50: number | null;
+  p90: number | null;
+}
+
+export interface DebugSession {
+  session: number;
+  endedAt: number;
+  summary: string;
+  segments: number;
+  filtered: number;
+  dropped: number;
+  translated: number;
+  failed: number;
+  skipped: number;
+  sameLang: number;
+  merges: number;
+  translatedSpeechMs: number;
+  stages: DebugStage[];
+}
+
 export type Screen = "home" | "transcript" | "history" | "glossary" | "settings" | "upgrade" | "about";
 export type SettingsGroup = "general" | "subtitles" | "audio" | "model" | "hotkeys" | "license" | "privacy";
 
@@ -171,6 +234,29 @@
   open_login_items_settings: { args: undefined; result: null };
   list_audio_sources: { args: undefined; result: AudioSourceOption[] };
   open_audio_permission_settings: { args: undefined; result: null };
+  // Bước "Nghe thử": phiên thu toàn hệ thống, kể cả âm thanh của chính app. Dừng bằng `toggle_session`.
+  start_listen_test: { args: undefined; result: AppStatus };
+  get_transcript: { args: undefined; result: Transcript };
+  // `utcOffsetMinutes`: độ lệch múi giờ của máy (phút, dương ở phía đông), để ghi giờ địa phương.
+  transcript_text: { args: { source: TranscriptRef; utcOffsetMinutes: number }; result: string };
+  // Pro. Trả đường dẫn đã ghi, `null` nếu người dùng bấm Hủy ở hộp thoại lưu.
+  export_transcript: {
+    args: { source: TranscriptRef; format: ExportFormat; srtText: SrtText; utcOffsetMinutes: number };
+    result: string | null;
+  };
+  list_history: { args: undefined; result: SessionSummary[] };
+  get_history_session: { args: { id: number }; result: Transcript };
+  delete_history_session: { args: { id: number }; result: null };
+  clear_history: { args: undefined; result: number };
+  list_glossary: { args: undefined; result: GlossaryEntry[] };
+  add_glossary_entry: { args: { source: string; target: string }; result: GlossaryEntry };
+  update_glossary_entry: { args: { id: number; source: string; target: string }; result: GlossaryEntry };
+  delete_glossary_entry: { args: { id: number }; result: null };
+  // `null` nếu người dùng bấm Hủy ở hộp thoại mở hay lưu file.
+  import_glossary_csv: { args: undefined; result: ImportReport | null };
+  export_glossary_csv: { args: undefined; result: string | null };
+  clear_all_data: { args: undefined; result: null };
+  get_debug_sessions: { args: undefined; result: DebugSession[] };
   get_overlay_view: { args: undefined; result: OverlayView };
 }
 
@@ -182,7 +268,7 @@
   "overlay://view": OverlayView;
   "subtitle://upsert": Subtitle;
   "subtitle://delta": SubtitleDelta;
-  // Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch.
+  // Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch; tới cả cửa sổ chính lẫn thanh phụ đề.
   "audio://level": number;
 }
 
```

Tạo `src/lib/subtitleView.ts`:

```ts
import type { AppStatus, Subtitle } from "./ipc";

// Cách hiện một phụ đề theo trạng thái (spec §4.4, §6.6), dùng chung cho thanh phụ đề và bản chép lời.
// - `done`: bản dịch (câu gốc chữ nhỏ ở trên nếu bật "hiện câu gốc").
// - `translating`: chữ dịch đang tới dần; chưa có chữ nào thì hiện câu gốc màu nhạt.
// - `asr_done`: đã có câu gốc, chờ dịch: câu gốc màu nhạt.
// - `same_lang`, `skipped`: chỉ câu gốc (câu đã là ngôn ngữ đích; bỏ bước dịch vì trễ).
// - `failed`: câu gốc, kèm nhãn "chưa dịch được".
// - `dropped`: "[bỏ qua đoạn]".
export type LineKind = "translated" | "translating" | "pending" | "sourceOnly" | "failed" | "dropped";

export interface LineView {
  kind: LineKind;
  // Chữ chính của dòng (rỗng với `dropped`: giao diện hiện nhãn i18n).
  main: string;
  // Câu gốc chữ nhỏ ở trên, khi bật "hiện câu gốc" và dòng chính là bản dịch.
  source: string | null;
  // Phụ đề tạm (§6.3): màu nhạt hơn.
  provisional: boolean;
}

export function lineView(s: Subtitle, showSource: boolean): LineView {
  const provisional = s.provisional;
  const translated = (kind: LineKind): LineView => ({
    kind,
    main: s.tgt_text,
    source: showSource ? s.src_text : null,
    provisional,
  });
  const sourceOnly = (kind: LineKind): LineView => ({ kind, main: s.src_text, source: null, provisional });
  switch (s.status) {
    case "done":
      return s.tgt_text ? translated("translated") : sourceOnly("sourceOnly");
    case "translating":
      return s.tgt_text ? translated("translating") : sourceOnly("pending");
    case "asr_done":
      return sourceOnly("pending");
    case "same_lang":
    case "skipped":
      return sourceOnly("sourceOnly");
    case "failed":
      return sourceOnly("failed");
    case "dropped":
      return { kind: "dropped", main: "", source: null, provisional };
  }
}

// Giờ địa phương `HH:MM:SS` của mốc `unixMs`, với độ lệch múi giờ `offsetMinutes` (dương ở phía đông).
export function clockTime(unixMs: number, offsetMinutes: number): string {
  const d = new Date(unixMs + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// Ngày giờ địa phương `YYYY-MM-DD HH:MM`.
export function dateTime(unixMs: number, offsetMinutes: number): string {
  const d = new Date(unixMs + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Độ lệch múi giờ của máy lúc này, theo cách phía Rust nhận (`utcOffsetMinutes`).
export function localOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset();
}

// Mức âm lượng (RMS) từ chừng này trở lên là "đang nghe thấy tiếng" (khoảng −50 dBFS).
export const HEARING_RMS = 0.003;

// Lời nhắc nhỏ trên thanh phụ đề (§4.2, §4.4, §9), theo thứ tự ưu tiên; khóa i18n là `overlay.note.<tên>`.
export type OverlayNote =
  | "firstRun"
  | "loading"
  | "quotaExhausted"
  | "error"
  | "noAudio"
  | "waitingForApp"
  | "lagging"
  | "translationUnavailable";

export function overlayNotes(status: AppStatus | null): OverlayNote[] {
  if (!status) return [];
  const notes: OverlayNote[] = [];
  if (status.loading === "firstRun") notes.push("firstRun");
  else if (status.loading === "model") notes.push("loading");
  if (status.session === "error") notes.push(status.sessionError === "quotaExhausted" ? "quotaExhausted" : "error");
  if (status.session === "running") {
    if (status.indicators.noAudio) notes.push("noAudio");
    if (status.waitingForApp) notes.push("waitingForApp");
    if (status.indicators.lagging) notes.push("lagging");
    if (status.indicators.translationUnavailable) notes.push("translationUnavailable");
  }
  return notes;
}
```

Sửa `src/store/app.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/app.ts b/src/store/app.ts
--- a/src/store/app.ts
+++ b/src/store/app.ts
@@ -5,6 +5,7 @@
   AppStatus,
   AudioSourceOption,
   CommandError,
+  DebugSession,
   HotkeyAction,
   Ipc,
   Lang,
@@ -48,6 +49,10 @@
   level: number;
   // Nguồn chọn được ở Cài đặt › Âm thanh; `null` là chưa đọc.
   audioSources: AudioSourceOption[] | null;
+  // Số đo của các phiên gần nhất cho bảng debug ẩn (§7); `null` là chưa đọc.
+  debugSessions: DebugSession[] | null;
+  // Vừa xóa xong toàn bộ dữ liệu (Cài đặt › Quyền riêng tư), để báo lại.
+  dataCleared: boolean;
   init(): Promise<() => void>;
   navigate(screen: Screen, settingsGroup?: SettingsGroup | null): void;
   setOnboardingStep(step: number): void;
@@ -63,6 +68,10 @@
   openAudioPermissionSettings(): Promise<void>;
   loadAudioSources(): Promise<void>;
   finishOnboarding(): Promise<void>;
+  // Bước "Nghe thử" (§4.1 bước 6): bắt đầu phiên thu toàn hệ thống, kể cả âm thanh của chính app.
+  startListenTest(): Promise<void>;
+  clearAllData(): Promise<void>;
+  loadDebugSessions(): Promise<void>;
   dismissError(): void;
   dismissNotice(): void;
 }
@@ -124,6 +133,8 @@
       sessionPending: false,
       level: 0,
       audioSources: null,
+      debugSessions: null,
+      dataCleared: false,
 
       // Lỗi ở bất kỳ bước nào thì gỡ các listener đã đăng ký rồi ném lỗi tiếp cho bên gọi (`main.tsx` hiện câu báo).
       async init() {
@@ -265,6 +276,39 @@
         if (await get().updateSettings({ onboardingDone: true })) set({ screen: "home" });
       },
 
+      // Như `toggleSession`: chặn bấm đúp; lỗi bắt đầu nằm trong trạng thái phiên.
+      async startListenTest() {
+        if (get().sessionPending) return;
+        set({ sessionPending: true });
+        try {
+          setStatus(await ipc.invoke("start_listen_test"));
+          set({ error: null });
+        } catch (e) {
+          const status = await ipc.invoke("get_app_status").catch(() => null);
+          if (status?.session === "error") {
+            setStatus(status);
+            set({ error: null });
+          } else set({ error: toUiError(e) });
+        } finally {
+          set({ sessionPending: false });
+        }
+      },
+
+      async clearAllData() {
+        set({ dataCleared: false });
+        await run(
+          () => ipc.invoke("clear_all_data"),
+          () => set({ dataCleared: true }),
+        );
+      },
+
+      async loadDebugSessions() {
+        await run(
+          () => ipc.invoke("get_debug_sessions"),
+          (debugSessions) => set({ debugSessions }),
+        );
+      },
+
       dismissError() {
         set({ error: null });
       },
```

Tạo `src/store/library.ts`:

```ts
import { createStore } from "zustand/vanilla";
import type { GlossaryEntry, ImportReport, Ipc, SessionSummary, Transcript } from "../lib/ipc";
import { type UiError, toUiError } from "./app";

// Lịch sử (F4) và từ điển thuật ngữ (F5) trong cửa sổ chính: cả hai là tính năng Pro, phía Rust kiểm Pro ở mọi lệnh
// (`pro::require`) và trả `proRequired` khi đang ở gói Free. Store chỉ giữ kết quả phía Rust trả về, không tự đoán.

export interface HistoryStoreState {
  sessions: SessionSummary[] | null;
  // Phiên đang mở để xem lại.
  open: { id: number; transcript: Transcript } | null;
  error: UiError | null;
  load(): Promise<void>;
  openSession(id: number): Promise<void>;
  close(): void;
  remove(id: number): Promise<void>;
  clearAll(): Promise<void>;
}

export function createHistoryStore(ipc: Ipc) {
  return createStore<HistoryStoreState>()((set, get) => {
    async function run(call: () => Promise<void>) {
      try {
        await call();
        set({ error: null });
      } catch (e) {
        set({ error: toUiError(e) });
      }
    }
    return {
      sessions: null,
      open: null,
      error: null,
      async load() {
        await run(async () => set({ sessions: await ipc.invoke("list_history") }));
      },
      async openSession(id) {
        await run(async () => set({ open: { id, transcript: await ipc.invoke("get_history_session", { id }) } }));
      },
      close() {
        set({ open: null });
      },
      async remove(id) {
        await run(async () => {
          await ipc.invoke("delete_history_session", { id });
          set({
            sessions: (get().sessions ?? []).filter((s) => s.id !== id),
            open: get().open?.id === id ? null : get().open,
          });
        });
      },
      async clearAll() {
        await run(async () => {
          await ipc.invoke("clear_history");
          set({ sessions: [], open: null });
        });
      },
    };
  });
}

export type HistoryStore = ReturnType<typeof createHistoryStore>;

// Tối đa 500 cặp (F5); phía Rust cũng từ chối khi đã đủ.
export const MAX_GLOSSARY = 500;

export interface GlossaryStoreState {
  entries: GlossaryEntry[] | null;
  // Lỗi của lệnh không gắn với ô nào (nhập, xuất, đọc danh sách, xóa).
  error: UiError | null;
  report: ImportReport | null;
  exported: string | null;
  load(): Promise<void>;
  // Lỗi của ô nhập (chữ nguồn trùng, rỗng, quá dài) trả về cho dòng đang sửa, không lên thanh lỗi chung.
  add(source: string, target: string): Promise<UiError | null>;
  update(id: number, source: string, target: string): Promise<UiError | null>;
  remove(id: number): Promise<void>;
  importCsv(): Promise<void>;
  exportCsv(): Promise<void>;
  dismiss(): void;
}

export function createGlossaryStore(ipc: Ipc) {
  return createStore<GlossaryStoreState>()((set, get) => {
    async function run(call: () => Promise<void>) {
      try {
        await call();
        set({ error: null });
      } catch (e) {
        set({ error: toUiError(e) });
      }
    }
    async function edit(call: () => Promise<GlossaryEntry>): Promise<UiError | null> {
      try {
        const entry = await call();
        const rest = (get().entries ?? []).filter((e) => e.id !== entry.id);
        set({ entries: [...rest, entry].sort((a, b) => a.id - b.id), error: null });
        return null;
      } catch (e) {
        return toUiError(e);
      }
    }
    return {
      entries: null,
      error: null,
      report: null,
      exported: null,
      async load() {
        await run(async () => set({ entries: await ipc.invoke("list_glossary") }));
      },
      add(source, target) {
        return edit(() => ipc.invoke("add_glossary_entry", { source, target }));
      },
      update(id, source, target) {
        return edit(() => ipc.invoke("update_glossary_entry", { id, source, target }));
      },
      async remove(id) {
        await run(async () => {
          await ipc.invoke("delete_glossary_entry", { id });
          set({ entries: (get().entries ?? []).filter((e) => e.id !== id) });
        });
      },
      async importCsv() {
        await run(async () => {
          const report = await ipc.invoke("import_glossary_csv");
          if (report === null) return;
          set({ report, exported: null, entries: await ipc.invoke("list_glossary") });
        });
      },
      async exportCsv() {
        await run(async () => {
          const path = await ipc.invoke("export_glossary_csv");
          if (path !== null) set({ exported: path, report: null });
        });
      },
      dismiss() {
        set({ error: null, report: null, exported: null });
      },
    };
  });
}

export type GlossaryStore = ReturnType<typeof createGlossaryStore>;
```

Sửa `src/store/overlay.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/overlay.ts b/src/store/overlay.ts
--- a/src/store/overlay.ts
+++ b/src/store/overlay.ts
@@ -2,7 +2,7 @@
 import type { AppStatus, Ipc, OverlayView, Subtitle, SubtitleDelta } from "../lib/ipc";
 
 // Store của thanh phụ đề. Cửa sổ `overlay` chỉ đọc được phần cài đặt của nó (`get_overlay_view`)
-// và nghe sự kiện; không gọi được lệnh nào khác (spec §10.2). Kế hoạch 03 làm đủ phần hiển thị.
+// và nghe sự kiện (phụ đề, trạng thái, mức âm lượng); không gọi được lệnh nào khác (spec §10.2).
 
 // Giữ tối đa `max` phụ đề gần nhất, xếp theo `id` (id tăng theo thứ tự câu, và không trùng giữa các phiên nhờ `id_base`).
 // Phụ đề cùng `id` (phụ đề tạm được thay, §6.3; bản dịch xong) cập nhật tại chỗ; phụ đề đã được gộp vào phụ đề mới
@@ -38,6 +38,8 @@
   view: OverlayView | null;
   status: AppStatus | null;
   lines: Subtitle[];
+  // Mức âm lượng vào gần nhất (RMS), cho chỉ báo "đang nghe"; 0 khi phiên không chạy.
+  level: number;
   init(): Promise<() => void>;
 }
 
@@ -46,6 +48,7 @@
     view: null,
     status: null,
     lines: [],
+    level: 0,
     async init() {
       const offs = await Promise.all([
         ipc.listen("overlay://view", (view) => set({ view, lines: get().lines.slice(-view.lines) })),
@@ -53,12 +56,14 @@
           set({ lines: upsertLine(get().lines, subtitle, get().view?.lines ?? 3) }),
         ),
         ipc.listen("subtitle://delta", (delta) => set({ lines: appendDelta(get().lines, delta) })),
+        ipc.listen("audio://level", (level) => set({ level })),
         // Trạng thái app (cùng `rev` như cửa sổ chính): bỏ trạng thái cũ tới muộn; phiên mới bắt đầu thì xóa phụ đề cũ.
         ipc.listen("app://status", (status) => {
           const prev = get().status;
           if (prev && status.rev < prev.rev) return;
           const fresh = status.session === "starting" && prev?.session !== "starting";
-          set(fresh ? { status, lines: [] } : { status });
+          const level = status.session === "running" ? get().level : 0;
+          set(fresh ? { status, lines: [], level } : { status, level });
         }),
       ]);
       // Cài đặt mới hơn đã tới qua `overlay://view` trong lúc chờ thì giữ bản đó (N-3 của review 02 lần 2).
```

Tạo `src/store/transcript.ts`:

```ts
import { createStore } from "zustand/vanilla";
import type { AppStatus, ExportFormat, Ipc, SrtText, Subtitle, Transcript, TranscriptRef } from "../lib/ipc";
import { localOffsetMinutes } from "../lib/subtitleView";
import { type UiError, toUiError } from "./app";
import { appendDelta } from "./overlay";

// Bản chép lời của phiên hiện tại trong cửa sổ chính (F4, §6.6): mọi câu của phiên, không giới hạn số dòng như thanh
// phụ đề. Lúc mở thì đọc bản phía Rust giữ (`get_transcript`), rồi theo sự kiện phụ đề. Sao chép (mọi gói) và xuất file
// (Pro) đều nhờ phía Rust dựng chữ (`transcript/export.rs`).

// Thêm hoặc thay phụ đề theo `id`, giữ thứ tự `id`; phụ đề đã được gộp vào nó (`replaces`) thì bỏ.
export function upsertAll(lines: readonly Subtitle[], subtitle: Subtitle): Subtitle[] {
  const kept = lines.filter((l) => l.id !== subtitle.id && !subtitle.replaces.includes(l.id));
  const at = kept.findIndex((l) => l.id > subtitle.id);
  return at < 0 ? [...kept, subtitle] : [...kept.slice(0, at), subtitle, ...kept.slice(at)];
}

// Ghép bản đọc từ phía Rust vào các dòng đã tới qua sự kiện: dòng đã có (từ sự kiện, mới hơn hoặc bằng) giữ nguyên, dòng
// chưa có thì thêm, dòng đã bị gộp đi (`removed`) thì không thêm lại.
export function mergeSnapshot(
  lines: readonly Subtitle[],
  snapshot: readonly Subtitle[],
  removed: ReadonlySet<number>,
): Subtitle[] {
  const have = new Set(lines.map((l) => l.id));
  const added = snapshot.filter((l) => !have.has(l.id) && !removed.has(l.id));
  return [...lines, ...added].sort((a, b) => a.id - b.id);
}

// Chuẩn hóa để tìm: NFC, chữ thường.
const fold = (text: string) => text.normalize("NFC").toLowerCase();

// Các dòng có câu gốc hoặc bản dịch chứa `query` (không phân biệt hoa thường, mọi dạng Unicode). Rỗng thì mọi dòng.
export function searchLines(lines: readonly Subtitle[], query: string): Subtitle[] {
  const q = fold(query.trim());
  if (!q) return [...lines];
  return lines.filter((l) => fold(l.src_text).includes(q) || fold(l.tgt_text).includes(q));
}

// Kết quả của thao tác gần nhất, để giao diện báo lại.
export type TranscriptNotice = { kind: "copied" } | { kind: "exported"; path: string };

export interface TranscriptStoreState {
  transcript: Transcript | null;
  notice: TranscriptNotice | null;
  error: UiError | null;
  init(): Promise<() => void>;
  copy(source: TranscriptRef): Promise<void>;
  exportTo(source: TranscriptRef, format: ExportFormat, srtText: SrtText): Promise<void>;
  dismiss(): void;
}

export interface TranscriptDeps {
  ipc: Ipc;
  writeClipboard(text: string): Promise<void>;
  offsetMinutes?: () => number;
}

export function createTranscriptStore({ ipc, writeClipboard, offsetMinutes = localOffsetMinutes }: TranscriptDeps) {
  // Id các phụ đề đã bị gộp đi trong phiên hiện tại, để bản đọc từ phía Rust tới muộn không thêm lại chúng.
  let removed = new Set<number>();
  let lastSession: AppStatus["session"] | null = null;

  return createStore<TranscriptStoreState>()((set, get) => {
    const empty = (): Transcript => ({ session: 0, startedAt: 0, endedAt: null, targetLang: "", lines: [] });

    async function refresh() {
      const snapshot = await ipc.invoke("get_transcript");
      const current = get().transcript;
      const lines = mergeSnapshot(current?.lines ?? [], snapshot.lines, removed);
      set({ transcript: { ...snapshot, lines } });
    }

    function onStatus(status: AppStatus) {
      const previous = lastSession;
      lastSession = status.session;
      // Phiên mới bắt đầu: bỏ bản của phiên trước; phiên vừa chạy hay vừa dừng: đọc lại để có giờ bắt đầu, giờ kết thúc.
      if (status.session === "starting" && previous !== "starting") {
        removed = new Set();
        set({ transcript: empty() });
      } else if (status.session !== previous && (status.session === "running" || previous === "running")) {
        void refresh().catch(() => {});
      }
    }

    async function run(call: () => Promise<TranscriptNotice | null>) {
      try {
        set({ notice: await call(), error: null });
      } catch (e) {
        set({ error: toUiError(e), notice: null });
      }
    }

    return {
      transcript: null,
      notice: null,
      error: null,

      async init() {
        const offs = await Promise.all([
          ipc.listen("subtitle://upsert", (subtitle) => {
            subtitle.replaces.forEach((id) => removed.add(id));
            const current = get().transcript ?? empty();
            set({ transcript: { ...current, lines: upsertAll(current.lines, subtitle) } });
          }),
          ipc.listen("subtitle://delta", (delta) => {
            const current = get().transcript;
            if (current) set({ transcript: { ...current, lines: appendDelta(current.lines, delta) } });
          }),
          ipc.listen("app://status", onStatus),
        ]);
        await refresh();
        return () => offs.forEach((off) => off());
      },

      async copy(source) {
        await run(async () => {
          const text = await ipc.invoke("transcript_text", { source, utcOffsetMinutes: offsetMinutes() });
          await writeClipboard(text);
          return { kind: "copied" };
        });
      },

      async exportTo(source, format, srtText) {
        await run(async () => {
          const path = await ipc.invoke("export_transcript", {
            source,
            format,
            srtText,
            utcOffsetMinutes: offsetMinutes(),
          });
          return path === null ? null : { kind: "exported", path };
        });
      },

      dismiss() {
        set({ notice: null, error: null });
      },
    };
  });
}

export type TranscriptStore = ReturnType<typeof createTranscriptStore>;
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
NO_COLOR=1 pnpm exec vitest run src/lib/subtitleView.test.ts src/store/transcript.test.ts src/store/library.test.ts 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  3 passed (3)
      Tests  21 passed (21)
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  8 passed (8)
      Tests  89 passed (89)
```

Run:
```bash
pnpm exec tsc --noEmit && echo tsc ok
```
Expected (lúc lập kế hoạch):
```text
tsc ok
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ipc.ts \
  src/lib/subtitleView.test.ts \
  src/lib/subtitleView.ts \
  src/store/app.test.ts \
  src/store/app.ts \
  src/store/library.test.ts \
  src/store/library.ts \
  src/store/overlay.test.ts \
  src/store/overlay.ts \
  src/store/transcript.test.ts \
  src/store/transcript.ts
git commit -m "feat(ui): kiểu và store cho bản chép lời, lịch sử, từ điển; cách hiện phụ đề theo trạng thái" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 2: Thanh phụ đề đủ §4.4

Dòng 15, 17, 43, 44, 65–68, 73, 81, 136, 153, 197, 219, 231, 238, 239.

- Mỗi dòng theo `lineView`: bản dịch, câu gốc chữ nhỏ ở trên (nếu bật), phụ đề tạm và câu chờ dịch nhạt hơn, `dropped` hiện "[bỏ qua đoạn]", `failed` có nhãn "chưa dịch được".
- Góc trên: chấm "đang nghe" (sáng khi có tiếng, `HEARING_RMS`), và lời nhắc của `overlayNotes`: đang chuẩn bị lần đầu, đang nạp model, hết hạn mức, lỗi, không nghe thấy âm thanh, app đã chọn không phát tiếng, đang trễ, dịch không khả dụng. Thanh không có nút nào (§4.4): nâng gói và xem lỗi ở cửa sổ chính (06 thêm thời điểm reset và nút nâng gói ở đó).
- Chữ trắng có viền tối nhiều hướng: đọc được cả khi nền gần trong suốt (§6.10, mục 34 của ghi chú cho 01).
- Windows (`edgeResize`): vùng kéo cạnh 6 px, góc 12 px, gọi `startResizeDragging`; vùng này đánh dấu `data-tauri-drag-region="false"` để không kéo di chuyển.

Không có test component (vitest chạy trong Node, không DOM); logic hiển thị đã có test ở Task 1. Hình thật kiểm ở Task 8 (người).

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/windows/overlay/overlay.css`
- Modify: `src/windows/overlay/overlay.tsx`

- [ ] **Step 1: Viết code**

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -125,6 +125,18 @@
   "onboarding.tray.openTaskbarSettings": "Open Taskbar settings",
 
   "overlay.waiting": "Subtitles will appear here",
+  "overlay.listening": "Listening",
+  "overlay.hearing": "Listening: sound detected",
+  "overlay.note.firstRun": "Preparing for first use…",
+  "overlay.note.loading": "Loading models…",
+  "overlay.note.quotaExhausted": "Translation quota used up",
+  "overlay.note.error": "Translation stopped because of an error. Open the main window for details.",
+  "overlay.note.noAudio": "No audio heard. Check that the meeting sound is playing.",
+  "overlay.note.waitingForApp": "The chosen app is not playing sound",
+  "overlay.note.lagging": "Falling behind",
+  "overlay.note.translationUnavailable": "Translation unavailable: original text only",
+  "subtitle.dropped": "[segment skipped]",
+  "subtitle.failed": "not translated",
 
   "notice.hotkeysFailed": "Some shortcuts could not be registered. Open Settings › Shortcuts to change them.",
   "notice.hotkeysFailedLater": "Some shortcuts could not be registered. You can change them in Settings › Shortcuts after these steps.",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -125,6 +125,18 @@
   "onboarding.tray.openTaskbarSettings": "Mở cài đặt Taskbar",
 
   "overlay.waiting": "Phụ đề sẽ hiện ở đây",
+  "overlay.listening": "Đang nghe",
+  "overlay.hearing": "Đang nghe: có tiếng",
+  "overlay.note.firstRun": "Đang chuẩn bị lần đầu…",
+  "overlay.note.loading": "Đang nạp model…",
+  "overlay.note.quotaExhausted": "Đã hết hạn mức dịch",
+  "overlay.note.error": "Phiên dịch đã dừng vì lỗi. Mở cửa sổ chính để xem chi tiết.",
+  "overlay.note.noAudio": "Không nghe thấy âm thanh. Kiểm tra âm thanh cuộc họp có đang phát không.",
+  "overlay.note.waitingForApp": "App đã chọn không phát tiếng",
+  "overlay.note.lagging": "Đang trễ",
+  "overlay.note.translationUnavailable": "Dịch không khả dụng: chỉ hiện câu gốc",
+  "subtitle.dropped": "[bỏ qua đoạn]",
+  "subtitle.failed": "chưa dịch được",
 
   "notice.hotkeysFailed": "Có phím tắt không đăng ký được. Mở Cài đặt › Phím tắt để đổi.",
   "notice.hotkeysFailedLater": "Có phím tắt không đăng ký được. Bạn đổi được ở Cài đặt › Phím tắt sau khi xong các bước này.",
```

Sửa `src/windows/overlay/overlay.css` (áp bằng `git apply`):

```diff
diff --git a/src/windows/overlay/overlay.css b/src/windows/overlay/overlay.css
--- a/src/windows/overlay/overlay.css
+++ b/src/windows/overlay/overlay.css
@@ -4,7 +4,10 @@
   overflow: hidden;
 }
 
+/* Chữ trắng có viền tối (bóng chữ nhiều hướng): đọc được cả khi nền gần trong suốt, trên mọi màu của cửa sổ họp bên dưới
+   (§6.10, trợ năng: đủ tương phản cho phụ đề). */
 .overlay {
+  position: relative;
   height: 100vh;
   display: flex;
   flex-direction: column;
@@ -15,6 +18,11 @@
   color: #ffffff;
   font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
   line-height: 1.35;
+  text-shadow:
+    0 0 2px #000000,
+    0 0 2px #000000,
+    1px 1px 2px #000000,
+    -1px -1px 2px #000000;
 }
 
 .overlay.unlocked {
@@ -25,14 +33,124 @@
 
 .overlay .source {
   font-size: 0.6em;
-  opacity: 0.75;
+  opacity: 0.8;
 }
 
-.overlay .provisional {
-  opacity: 0.6;
+/* Câu chưa dịch xong hay phụ đề tạm: nhạt hơn (§4.4). */
+.overlay .provisional,
+.overlay .pending {
+  opacity: 0.65;
+}
+
+.overlay .sourceOnly,
+.overlay .failed,
+.overlay .dropped {
+  font-style: italic;
+}
+
+.overlay .tag {
+  margin-left: 0.5em;
+  font-size: 0.55em;
+  padding: 0 0.4em;
+  border: 1px solid rgba(255, 255, 255, 0.6);
+  border-radius: 0.3em;
+  vertical-align: middle;
 }
 
 .overlay .waiting {
-  opacity: 0.6;
+  opacity: 0.7;
   font-size: 0.7em;
 }
+
+.overlay .indicators {
+  position: absolute;
+  top: 0.35rem;
+  right: 0.75rem;
+  display: flex;
+  gap: 0.5rem;
+  align-items: center;
+  font-size: 13px;
+}
+
+.overlay .dot {
+  width: 0.6rem;
+  height: 0.6rem;
+  border-radius: 50%;
+  background: rgba(255, 255, 255, 0.35);
+  box-shadow: 0 0 2px #000000;
+}
+
+.overlay .dot.hearing {
+  background: #4cc38a;
+}
+
+.overlay .note {
+  padding: 0.05rem 0.45rem;
+  border-radius: 0.4rem;
+  background: rgba(0, 0, 0, 0.55);
+}
+
+.overlay .note.lagging,
+.overlay .note.noAudio,
+.overlay .note.error,
+.overlay .note.quotaExhausted {
+  background: rgba(163, 38, 27, 0.85);
+}
+
+/* Vùng kéo cạnh (Windows): 6 px ở mỗi cạnh, 12 px ở góc. */
+.overlay .edge {
+  position: absolute;
+}
+.overlay .edge.n,
+.overlay .edge.s {
+  left: 12px;
+  right: 12px;
+  height: 6px;
+  cursor: ns-resize;
+}
+.overlay .edge.e,
+.overlay .edge.w {
+  top: 12px;
+  bottom: 12px;
+  width: 6px;
+  cursor: ew-resize;
+}
+.overlay .edge.n {
+  top: 0;
+}
+.overlay .edge.s {
+  bottom: 0;
+}
+.overlay .edge.e {
+  right: 0;
+}
+.overlay .edge.w {
+  left: 0;
+}
+.overlay .edge.ne,
+.overlay .edge.nw,
+.overlay .edge.se,
+.overlay .edge.sw {
+  width: 12px;
+  height: 12px;
+}
+.overlay .edge.ne {
+  top: 0;
+  right: 0;
+  cursor: nesw-resize;
+}
+.overlay .edge.sw {
+  bottom: 0;
+  left: 0;
+  cursor: nesw-resize;
+}
+.overlay .edge.nw {
+  top: 0;
+  left: 0;
+  cursor: nwse-resize;
+}
+.overlay .edge.se {
+  bottom: 0;
+  right: 0;
+  cursor: nwse-resize;
+}
```

Sửa `src/windows/overlay/overlay.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/overlay/overlay.tsx b/src/windows/overlay/overlay.tsx
--- a/src/windows/overlay/overlay.tsx
+++ b/src/windows/overlay/overlay.tsx
@@ -1,40 +1,104 @@
 import "./overlay.css";
+import { getCurrentWindow } from "@tauri-apps/api/window";
 import { StrictMode } from "react";
 import { createRoot } from "react-dom/client";
 import { useStore } from "zustand";
 import { translate } from "../../i18n";
 import { tauriIpc } from "../../lib/ipc";
+import { HEARING_RMS, lineView, overlayNotes } from "../../lib/subtitleView";
 import { createOverlayStore } from "../../store/overlay";
 
 const store = createOverlayStore(tauriIpc);
-// Thuộc tính `lang` của trang theo ngôn ngữ giao diện (chữ chờ, sau này là nhãn), để trình đọc màn hình đọc đúng giọng.
+// Thuộc tính `lang` của trang theo ngôn ngữ giao diện, để trình đọc màn hình đọc đúng giọng.
 store.subscribe((state) => {
   if (state.view) document.documentElement.lang = state.view.uiLanguage;
 });
 void store.getState().init();
 
-// Thanh phụ đề (§4.4): N dòng gần nhất, phụ đề tạm màu nhạt hơn. Khi chưa khóa thì kéo được cả thanh
-// (`data-tauri-drag-region="deep"`, như spike S5); khi khóa thì click xuyên qua, do phía Rust đặt.
-// Kế hoạch 03 làm đủ phần hiển thị (hiện dần từng chữ, chỉ báo, kéo cạnh đổi kích thước).
+// Vùng kéo cạnh để đổi kích thước (§4.4), chỉ trên Windows (`edgeResize`): bấm giữ thì hệ điều hành đổi kích thước
+// cửa sổ (`startResizeDragging`). Vùng này không phải vùng kéo di chuyển (`data-tauri-drag-region="false"`).
+const EDGES = [
+  ["n", "North"],
+  ["s", "South"],
+  ["e", "East"],
+  ["w", "West"],
+  ["ne", "NorthEast"],
+  ["nw", "NorthWest"],
+  ["se", "SouthEast"],
+  ["sw", "SouthWest"],
+] as const;
+
+function ResizeEdges() {
+  return (
+    <>
+      {EDGES.map(([cls, direction]) => (
+        <div
+          key={cls}
+          className={`edge ${cls}`}
+          data-tauri-drag-region="false"
+          aria-hidden="true"
+          onMouseDown={(e) => {
+            if (e.button !== 0) return;
+            e.preventDefault();
+            void getCurrentWindow()
+              .startResizeDragging(direction)
+              .catch(() => {});
+          }}
+        />
+      ))}
+    </>
+  );
+}
+
+// Thanh phụ đề (§4.4): N dòng gần nhất, bản dịch hiện dần, phụ đề tạm màu nhạt hơn, câu gốc chữ nhỏ ở trên nếu bật.
+// Chỉ báo nhỏ ở góc trên: chấm "đang nghe" (sáng khi có tiếng), và các lời nhắc (đang nạp model, không có âm thanh,
+// đang trễ, dịch không khả dụng, hết hạn mức, lỗi). Khi chưa khóa thì kéo được cả thanh (`data-tauri-drag-region="deep"`);
+// khi khóa thì click xuyên qua, do phía Rust đặt. Thanh không có nút nào (§4.4): nâng gói, xem lỗi ở cửa sổ chính.
 function Overlay() {
   const view = useStore(store, (s) => s.view);
   const lines = useStore(store, (s) => s.lines);
+  const status = useStore(store, (s) => s.status);
+  const level = useStore(store, (s) => s.level);
   if (!view) return null;
+  const t = (key: Parameters<typeof translate>[1]) => translate(view.uiLanguage, key);
+  const notes = overlayNotes(status);
+  const running = status?.session === "running";
+  const hearing = running && level >= HEARING_RMS;
   return (
     <div
       className={view.locked ? "overlay" : "overlay unlocked"}
       data-tauri-drag-region={view.locked ? undefined : "deep"}
       style={{ fontSize: view.fontSize, background: `rgba(0, 0, 0, ${view.opacity})` }}
     >
-      {lines.length === 0 && <div className="waiting">{translate(view.uiLanguage, "overlay.waiting")}</div>}
-      {lines.map((l) => (
-        <div key={l.id} className={l.provisional ? "provisional" : undefined}>
-          {/* Chưa có chữ dịch (đang dịch, cùng ngôn ngữ, dịch lỗi): hiện câu gốc một lần. Kế hoạch 03 thêm nhãn cho từng
-              trạng thái. */}
-          {view.showSource && l.tgt_text && <div className="source">{l.src_text}</div>}
-          <div>{l.tgt_text || l.src_text}</div>
-        </div>
-      ))}
+      <div className="indicators" role="status">
+        {running && (
+          <span
+            className={hearing ? "dot hearing" : "dot"}
+            role="img"
+            aria-label={t(hearing ? "overlay.hearing" : "overlay.listening")}
+          />
+        )}
+        {notes.map((n) => (
+          <span key={n} className={`note ${n}`}>
+            {t(`overlay.note.${n}`)}
+          </span>
+        ))}
+      </div>
+      {lines.length === 0 && notes.length === 0 && <div className="waiting">{t("overlay.waiting")}</div>}
+      {lines.map((l) => {
+        const v = lineView(l, view.showSource);
+        const classes = ["line", v.kind, v.provisional ? "provisional" : ""].filter(Boolean).join(" ");
+        return (
+          <div key={l.id} className={classes}>
+            {v.source && <div className="source">{v.source}</div>}
+            <div className="main">
+              {v.kind === "dropped" ? t("subtitle.dropped") : v.main}
+              {v.kind === "failed" && <span className="tag">{t("subtitle.failed")}</span>}
+            </div>
+          </div>
+        );
+      })}
+      {view.edgeResize && !view.locked && <ResizeEdges />}
     </div>
   );
 }
```

- [ ] **Step 2: Chạy test**

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  8 passed (8)
      Tests  89 passed (89)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.ts \
  src/i18n/vi.ts \
  src/windows/overlay/overlay.css \
  src/windows/overlay/overlay.tsx
git commit -m "feat(ui): thanh phụ đề đủ §4.4: trạng thái từng dòng, chỉ báo đang nghe, lời nhắc, kéo cạnh trên Windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 3: Cài đặt › Phụ đề, Cài đặt › Quyền riêng tư

Dòng 51, 56, 57, 252.

- Nhóm "Phụ đề": cỡ chữ 14–48, số dòng 1–3, độ mờ nền 0–100%, hiện câu gốc; nút hiện hay ẩn thanh phụ đề để xem thử. Thanh trượt chỉ gửi giá trị khi thả (`CommitRange`, dùng lại được cho nhóm khác).
- Nhóm "Quyền riêng tư": "Lưu lịch sử chép lời" (Pro; ở Free thì khóa, trừ khi đang bật để còn tắt được), "Xóa toàn bộ dữ liệu" có bước xác nhận ngay trên trang (không dùng `confirm()`, QĐ17). Kế hoạch 04 thêm nút "Xóa model và dữ liệu" vào `PrivacySettings.tsx`.
- Bỏ hai câu mô tả "chưa có" của hai nhóm này.

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/styles/main.css`
- Modify: `src/windows/main/screens/SettingsScreen.tsx`
- Create: `src/windows/main/settings/CommitRange.tsx`
- Create: `src/windows/main/settings/PrivacySettings.tsx`
- Create: `src/windows/main/settings/SubtitleSettings.tsx`

- [ ] **Step 1: Viết code**

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -67,10 +67,21 @@
   "settings.group.hotkeys": "Shortcuts",
   "settings.group.license": "License",
   "settings.group.privacy": "Privacy",
-  "settings.subtitles.description": "Font size, number of lines, background opacity and original text.",
   "settings.model.description": "Model pack in use, disk space, download again or delete.",
   "settings.license.description": "License key, status and expiry date, renew or deactivate.",
-  "settings.privacy.description": "Saving history, delete all data, delete models and data.",
+  "settings.subtitles.fontSize": "Font size",
+  "settings.subtitles.lines": "Number of lines",
+  "settings.subtitles.opacity": "Background opacity",
+  "settings.subtitles.showSource": "Show the original text above the translation",
+  "settings.subtitles.hint": "Changes show on the subtitle bar at once. Drag the bar to move it and drag its edges to resize it; its place is remembered for each screen.",
+  "settings.privacy.saveHistory": "Save transcript history",
+  "settings.privacy.saveHistory.hint": "Off by default. When on, each finished session is saved, encrypted, on this computer only.",
+  "settings.privacy.saveHistory.pro": "Saving history is a Pro feature.",
+  "settings.privacy.clear": "Delete all data",
+  "settings.privacy.clear.hint": "Deletes the saved history and the glossary from this computer. Your license, quota and settings are kept.",
+  "settings.privacy.clear.confirm": "Delete all history and glossary terms? This cannot be undone.",
+  "settings.privacy.clear.yes": "Delete",
+  "settings.privacy.cleared": "History and glossary deleted.",
   "settings.audio.source": "Audio source",
   "settings.audio.refresh": "Refresh list",
   "settings.audio.hint.macos": "Only apps that are playing sound right now are listed, together with their helper processes (browsers, Electron apps). With one app chosen, other sounds such as notifications are not translated. A new source applies from the next session.",
@@ -145,6 +156,7 @@
   "notice.loginItemsApproval": "AI Translator is turned off in System Settings › General › Login Items & Extensions (Login Items on macOS 14), so it will not open when you log in. Turn it on there.",
   "notice.openLoginItems": "Open Login Items",
 
+  "common.cancel": "Cancel",
   "common.dismiss": "Dismiss",
   "common.notYet": "Not available yet.",
   "common.openPermissionSettings": "Open System Settings",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -67,10 +67,21 @@
   "settings.group.hotkeys": "Phím tắt",
   "settings.group.license": "Bản quyền",
   "settings.group.privacy": "Quyền riêng tư",
-  "settings.subtitles.description": "Cỡ chữ, số dòng, độ mờ nền và câu gốc.",
   "settings.model.description": "Gói model đang dùng, dung lượng, tải lại hoặc xóa.",
   "settings.license.description": "Key bản quyền, trạng thái và ngày hết hạn, gia hạn hoặc gỡ kích hoạt.",
-  "settings.privacy.description": "Lưu lịch sử, xóa toàn bộ dữ liệu, xóa model và dữ liệu.",
+  "settings.subtitles.fontSize": "Cỡ chữ",
+  "settings.subtitles.lines": "Số dòng",
+  "settings.subtitles.opacity": "Độ mờ nền",
+  "settings.subtitles.showSource": "Hiện câu gốc phía trên bản dịch",
+  "settings.subtitles.hint": "Thanh phụ đề đổi ngay theo. Kéo thanh để di chuyển, kéo cạnh để đổi kích thước; vị trí được nhớ riêng cho từng màn hình.",
+  "settings.privacy.saveHistory": "Lưu lịch sử chép lời",
+  "settings.privacy.saveHistory.hint": "Mặc định tắt. Khi bật, mỗi phiên đã dừng được lưu, có mã hóa, chỉ trên máy này.",
+  "settings.privacy.saveHistory.pro": "Lưu lịch sử là tính năng Pro.",
+  "settings.privacy.clear": "Xóa toàn bộ dữ liệu",
+  "settings.privacy.clear.hint": "Xóa lịch sử đã lưu và từ điển thuật ngữ trên máy này. Bản quyền, hạn mức và cài đặt được giữ nguyên.",
+  "settings.privacy.clear.confirm": "Xóa toàn bộ lịch sử và thuật ngữ? Không khôi phục được.",
+  "settings.privacy.clear.yes": "Xóa",
+  "settings.privacy.cleared": "Đã xóa lịch sử và từ điển.",
   "settings.audio.source": "Nguồn âm thanh",
   "settings.audio.refresh": "Làm mới danh sách",
   "settings.audio.hint.macos": "Danh sách chỉ có các app đang phát tiếng, gộp cả các tiến trình phụ của app (trình duyệt, app Electron). Khi chọn một app, các âm thanh khác như tiếng thông báo sẽ không được dịch. Đổi nguồn có tác dụng từ phiên dịch sau.",
@@ -145,6 +156,7 @@
   "notice.loginItemsApproval": "AI Translator đang bị tắt ở System Settings › General › Login Items & Extensions (macOS 14: Login Items), nên sẽ không tự mở khi đăng nhập. Hãy bật lại ở đó.",
   "notice.openLoginItems": "Mở Login Items",
 
+  "common.cancel": "Hủy",
   "common.dismiss": "Đóng",
   "common.notYet": "Chưa có.",
   "common.openPermissionSettings": "Mở System Settings",
```

Sửa `src/styles/main.css` (áp bằng `git apply`):

```diff
diff --git a/src/styles/main.css b/src/styles/main.css
--- a/src/styles/main.css
+++ b/src/styles/main.css
@@ -34,6 +34,12 @@
   color: var(--color-accent-text);
 }
 
+button.danger {
+  background: var(--color-danger);
+  border-color: var(--color-danger);
+  color: var(--color-surface);
+}
+
 button:disabled {
   cursor: default;
   opacity: 0.5;
```

Sửa `src/windows/main/screens/SettingsScreen.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/screens/SettingsScreen.tsx b/src/windows/main/screens/SettingsScreen.tsx
--- a/src/windows/main/screens/SettingsScreen.tsx
+++ b/src/windows/main/screens/SettingsScreen.tsx
@@ -5,15 +5,15 @@
 import { AudioSettings } from "../settings/AudioSettings";
 import { GeneralSettings } from "../settings/GeneralSettings";
 import { HotkeySettings } from "../settings/HotkeySettings";
+import { PrivacySettings } from "../settings/PrivacySettings";
+import { SubtitleSettings } from "../settings/SubtitleSettings";
 
 const GROUPS: readonly SettingsGroup[] = ["general", "subtitles", "audio", "model", "hotkeys", "license", "privacy"];
 
-// Nhóm do kế hoạch khác làm: Phụ đề (03), Model (04), Bản quyền (06), Quyền riêng tư (03, 04).
+// Nhóm do kế hoạch khác làm: Model (04), Bản quyền (06).
 const DESCRIPTIONS: Partial<Record<SettingsGroup, MessageKey>> = {
-  subtitles: "settings.subtitles.description",
   model: "settings.model.description",
   license: "settings.license.description",
-  privacy: "settings.privacy.description",
 };
 
 // Nhóm cài đặt là một bộ tab (WAI-ARIA Tabs): chỉ tab đang chọn nằm trong thứ tự Tab, mũi tên trái/phải và
@@ -66,6 +66,8 @@
         tabIndex={description ? 0 : undefined}
       >
         {group === "general" && <GeneralSettings />}
+        {group === "subtitles" && <SubtitleSettings />}
+        {group === "privacy" && <PrivacySettings />}
         {group === "audio" && <AudioSettings />}
         {group === "hotkeys" && <HotkeySettings />}
         {description && (
```

Tạo `src/windows/main/settings/CommitRange.tsx`:

```tsx
import { useState } from "react";

// Thanh trượt chỉ gửi giá trị khi thả chuột, nhấc phím hay rời ô, để kéo không gửi hàng chục lần `update_settings`.
export function CommitRange({
  id,
  min,
  max,
  step,
  value,
  format,
  onCommit,
}: {
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span>{format(shown)}</span>
    </>
  );
}
```

Tạo `src/windows/main/settings/PrivacySettings.tsx`:

```tsx
import { useState } from "react";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Quyền riêng tư" (§4.3): bật/tắt lưu lịch sử (Pro, mặc định tắt), và nút xóa toàn bộ dữ liệu (lịch sử và
// từ điển thuật ngữ), có bước xác nhận. Xóa dữ liệu không đụng tới bản quyền, hạn mức hay cài đặt, và dùng được ở mọi gói.
// Kế hoạch 04 thêm nút "Xóa model và dữ liệu" vào nhóm này.
export function PrivacySettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const pro = useApp((s) => s.status?.pro ?? false);
  const update = useApp((s) => s.updateSettings);
  const clearAll = useApp((s) => s.clearAllData);
  const cleared = useApp((s) => s.dataCleared);
  const [confirming, setConfirming] = useState(false);
  if (!settings) return null;
  return (
    <>
      <div className="card">
        <div className="row">
          <label htmlFor="save-history">{t("settings.privacy.saveHistory")}</label>
          <input
            id="save-history"
            type="checkbox"
            checked={settings.saveHistory}
            disabled={!pro && !settings.saveHistory}
            aria-describedby="save-history-hint"
            onChange={(e) => void update({ saveHistory: e.target.checked })}
          />
        </div>
        <p id="save-history-hint" className="hint">
          {t(pro ? "settings.privacy.saveHistory.hint" : "settings.privacy.saveHistory.pro")}
        </p>
      </div>
      <div className="card">
        <h2>{t("settings.privacy.clear")}</h2>
        <p className="hint">{t("settings.privacy.clear.hint")}</p>
        <div className="row" role="status">
          {!confirming && (
            <button onClick={() => setConfirming(true)}>{t("settings.privacy.clear")}</button>
          )}
          {confirming && (
            <>
              <span className="error-text">{t("settings.privacy.clear.confirm")}</span>
              <button
                className="danger"
                onClick={() => {
                  setConfirming(false);
                  void clearAll();
                }}
              >
                {t("settings.privacy.clear.yes")}
              </button>
              <button onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
            </>
          )}
          {!confirming && cleared && <span>{t("settings.privacy.cleared")}</span>}
        </div>
      </div>
    </>
  );
}
```

Tạo `src/windows/main/settings/SubtitleSettings.tsx`:

```tsx
import { useApp, useT } from "../appStore";
import { CommitRange } from "./CommitRange";

// Nhóm Cài đặt "Phụ đề" (§4.3, §6.9): cỡ chữ (14–48), số dòng (1–3), độ mờ nền (0–100%), hiện câu gốc. Thanh phụ đề
// đổi ngay theo (`overlay://view`); nút "Hiện thanh phụ đề" để xem thử khi chưa dịch.
export function SubtitleSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const update = useApp((s) => s.updateSettings);
  const setVisible = useApp((s) => s.setOverlayVisible);
  if (!settings || !status) return null;
  const o = settings.overlay;
  return (
    <div className="card">
      <div className="row">
        <label htmlFor="font-size">{t("settings.subtitles.fontSize")}</label>
        <CommitRange
          id="font-size"
          min={14}
          max={48}
          step={1}
          value={o.fontSize}
          format={(v) => `${v} px`}
          onCommit={(fontSize) => void update({ overlay: { fontSize } })}
        />
      </div>
      <div className="row">
        <label htmlFor="lines">{t("settings.subtitles.lines")}</label>
        <select id="lines" value={o.lines} onChange={(e) => void update({ overlay: { lines: Number(e.target.value) } })}>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label htmlFor="opacity">{t("settings.subtitles.opacity")}</label>
        <CommitRange
          id="opacity"
          min={0}
          max={1}
          step={0.05}
          value={o.opacity}
          format={(v) => `${Math.round(v * 100)}%`}
          onCommit={(opacity) => void update({ overlay: { opacity } })}
        />
      </div>
      <div className="row">
        <label htmlFor="show-source">{t("settings.subtitles.showSource")}</label>
        <input
          id="show-source"
          type="checkbox"
          checked={o.showSource}
          onChange={(e) => void update({ overlay: { showSource: e.target.checked } })}
        />
      </div>
      <div className="row">
        <span>{t("home.overlay")}</span>
        <button onClick={() => void setVisible(!status.overlayVisible)}>
          {t(status.overlayVisible ? "home.overlay.hide" : "home.overlay.show")}
        </button>
      </div>
      <p className="hint">{t("settings.subtitles.hint")}</p>
    </div>
  );
}
```

- [ ] **Step 2: Chạy test**

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  8 passed (8)
      Tests  89 passed (89)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.ts \
  src/i18n/vi.ts \
  src/styles/main.css \
  src/windows/main/screens/SettingsScreen.tsx \
  src/windows/main/settings/CommitRange.tsx \
  src/windows/main/settings/PrivacySettings.tsx \
  src/windows/main/settings/SubtitleSettings.tsx
git commit -m "feat(ui): Cài đặt › Phụ đề và Quyền riêng tư: cỡ chữ, số dòng, độ mờ, câu gốc; lưu lịch sử, xóa toàn bộ dữ liệu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 4: Màn hình Bản chép lời và Lịch sử

Dòng 18, 45, 47, 48, 153.

- `TranscriptView`: mỗi câu có giờ địa phương, câu gốc, bản dịch (theo `lineView`); ô tìm; "Sao chép tất cả" (mọi gói, `navigator.clipboard`, không có thì `execCommand("copy")`); "Xuất…" TXT, SRT (chọn bản dịch hay câu gốc), Markdown, khóa ở gói Free kèm nút Nâng cấp.
- `dataStores.ts`: các store dữ liệu nối với lõi Rust; `main.tsx` cho bản chép lời nghe sự kiện từ lúc mở cửa sổ, để không sót câu khi màn hình chưa mở.
- Màn hình Bản chép lời: phiên hiện tại hoặc vừa dừng. Màn hình chính: dừng xong thì có nút "Mở bản chép lời" (§4.2 bước 3).
- Màn hình Lịch sử (Pro, `ProLocked` ở gói Free): danh sách mới nhất trước (ngày giờ, số phút, số câu, câu đầu), mở xem lại bằng `TranscriptView`, xóa từng phiên, xóa tất cả có bước xác nhận; lưu lịch sử đang tắt thì nhắc và có nút mở Cài đặt › Quyền riêng tư.

**Files:**
- Create: `src/components/ProLocked.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/styles/main.css`
- Modify: `src/windows/main/Shell.tsx`
- Create: `src/windows/main/TranscriptView.tsx`
- Create: `src/windows/main/dataStores.ts`
- Modify: `src/windows/main/main.tsx`
- Create: `src/windows/main/screens/HistoryScreen.tsx`
- Modify: `src/windows/main/screens/Home.tsx`
- Modify: `src/windows/main/screens/Placeholders.tsx`
- Create: `src/windows/main/screens/TranscriptScreen.tsx`

- [ ] **Step 1: Viết code**

Tạo `src/components/ProLocked.tsx`:

```tsx
// Màn hình của tính năng Pro khi đang ở gói Free (Đ6): nói rõ là tính năng Pro, kèm nút mở màn hình Nâng cấp.
export function ProLocked({ text, upgradeLabel, onUpgrade }: { text: string; upgradeLabel: string; onUpgrade: () => void }) {
  return (
    <div className="card">
      <p>{text}</p>
      <button className="primary" onClick={onUpgrade}>
        {upgradeLabel}
      </button>
    </div>
  );
}
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -32,6 +32,7 @@
   "home.audioSource.app": "Only {app}",
   "home.audioSource.webkit": "Safari and web pages inside other apps",
   "home.audioSource.change": "Change",
+  "home.openTranscript": "Open the transcript",
   "home.languages": "Languages",
   "home.audioSource": "Audio source",
   "home.audioSource.system.macos": "Whole system, except this app",
@@ -59,6 +60,28 @@
   "history.empty": "Saved sessions will appear here. Saving history is a Pro feature and is off by default.",
   "glossary.empty": "Your glossary terms will appear here. The glossary is a Pro feature.",
   "upgrade.empty": "Pro plans and in-app payment will appear here.",
+  "transcript.search": "Search",
+  "transcript.search.placeholder": "Words in the original or the translation",
+  "transcript.copy": "Copy all",
+  "transcript.copied": "Copied to the clipboard.",
+  "transcript.export": "Export as",
+  "transcript.export.srtText": "Text of the SRT file",
+  "transcript.export.translation": "Translation",
+  "transcript.export.source": "Original",
+  "transcript.export.button": "Export…",
+  "transcript.export.pro": "Exporting to a file is a Pro feature. Copying works on every plan.",
+  "transcript.exported": "Saved to {path}",
+  "transcript.noMatch": "No sentence matches your search.",
+  "history.pro": "History is a Pro feature: past sessions are saved, encrypted, on this computer.",
+  "history.off": "Saving history is off, so new sessions are not saved. Turn it on in Settings › Privacy.",
+  "history.meta": "{minutes} min · {lines} sentences",
+  "history.open": "Open",
+  "history.delete": "Delete",
+  "history.back": "Back to the list",
+  "history.clear": "Delete all sessions",
+  "history.clear.confirm": "Delete every saved session? This cannot be undone.",
+  "glossary.pro": "The glossary is a Pro feature: your terms are used when translating.",
+  "pro.upgrade": "Upgrade to Pro",
 
   "settings.group.general": "General",
   "settings.group.subtitles": "Subtitles",
@@ -202,6 +225,7 @@
   "error.historyNotFound": "This session is no longer in the history.",
   "error.fileFailed": "Could not read or write that file. Choose another place and try again.",
   "error.fileTooLarge": "This file is too large. A glossary file is at most 1 MB.",
+  "error.copyFailed": "Could not copy to the clipboard.",
   "error.unknown": "Something went wrong.",
 } as const;
 
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -32,6 +32,7 @@
   "home.audioSource.app": "Chỉ {app}",
   "home.audioSource.webkit": "Safari và trang web trong các app khác",
   "home.audioSource.change": "Đổi",
+  "home.openTranscript": "Mở bản chép lời",
   "home.languages": "Ngôn ngữ",
   "home.audioSource": "Nguồn âm thanh",
   "home.audioSource.system.macos": "Toàn hệ thống, trừ app này",
@@ -59,6 +60,28 @@
   "history.empty": "Các phiên đã lưu sẽ hiện ở đây. Lưu lịch sử là tính năng Pro và mặc định tắt.",
   "glossary.empty": "Các thuật ngữ của bạn sẽ hiện ở đây. Từ điển thuật ngữ là tính năng Pro.",
   "upgrade.empty": "Các gói Pro và thanh toán ngay trong app sẽ hiện ở đây.",
+  "transcript.search": "Tìm",
+  "transcript.search.placeholder": "Chữ trong câu gốc hoặc bản dịch",
+  "transcript.copy": "Sao chép tất cả",
+  "transcript.copied": "Đã sao chép vào clipboard.",
+  "transcript.export": "Xuất ra",
+  "transcript.export.srtText": "Chữ của file SRT",
+  "transcript.export.translation": "Bản dịch",
+  "transcript.export.source": "Câu gốc",
+  "transcript.export.button": "Xuất…",
+  "transcript.export.pro": "Xuất ra file là tính năng Pro. Sao chép thì dùng được ở mọi gói.",
+  "transcript.exported": "Đã lưu vào {path}",
+  "transcript.noMatch": "Không có câu nào khớp.",
+  "history.pro": "Lịch sử là tính năng Pro: các phiên đã dịch được lưu, có mã hóa, trên máy này.",
+  "history.off": "Lưu lịch sử đang tắt, nên phiên mới không được lưu. Bật ở Cài đặt › Quyền riêng tư.",
+  "history.meta": "{minutes} phút · {lines} câu",
+  "history.open": "Mở",
+  "history.delete": "Xóa",
+  "history.back": "Về danh sách",
+  "history.clear": "Xóa tất cả các phiên",
+  "history.clear.confirm": "Xóa mọi phiên đã lưu? Không khôi phục được.",
+  "glossary.pro": "Từ điển thuật ngữ là tính năng Pro: thuật ngữ của bạn được dùng khi dịch.",
+  "pro.upgrade": "Nâng cấp Pro",
 
   "settings.group.general": "Chung",
   "settings.group.subtitles": "Phụ đề",
@@ -202,5 +225,6 @@
   "error.historyNotFound": "Phiên này không còn trong lịch sử.",
   "error.fileFailed": "Không đọc hay ghi được file đó. Hãy chọn chỗ khác rồi thử lại.",
   "error.fileTooLarge": "File này quá lớn. File từ điển tối đa 1 MB.",
+  "error.copyFailed": "Không sao chép được vào clipboard.",
   "error.unknown": "Có lỗi xảy ra.",
 };
```

Sửa `src/styles/main.css` (áp bằng `git apply`):

```diff
diff --git a/src/styles/main.css b/src/styles/main.css
--- a/src/styles/main.css
+++ b/src/styles/main.css
@@ -234,3 +234,60 @@
   height: auto;
   color: var(--color-muted);
 }
+
+button.link {
+  border-color: transparent;
+  background: transparent;
+  color: var(--color-accent);
+  text-decoration: underline;
+}
+
+input[type="search"],
+input[type="text"] {
+  padding: 0.3rem 0.5rem;
+  border: 1px solid var(--color-border);
+  border-radius: var(--radius);
+  background: var(--color-surface);
+  min-width: 16rem;
+}
+
+/* Bản chép lời: giờ ở cột trái, câu gốc rồi bản dịch. Chọn và sao chép bằng chuột được như chữ thường. */
+.transcript {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+}
+
+.transcript li {
+  display: grid;
+  grid-template-columns: 6rem 1fr;
+  gap: 0.75rem;
+  padding: 0.5rem 0;
+  border-bottom: 1px solid var(--color-border);
+}
+
+.transcript time {
+  color: var(--color-muted);
+  font-variant-numeric: tabular-nums;
+}
+
+.transcript .tgt {
+  font-weight: 600;
+}
+
+.transcript .provisional,
+.transcript .pending {
+  opacity: 0.65;
+}
+
+.transcript .dropped .src,
+.transcript .failed .tgt {
+  color: var(--color-muted);
+  font-style: italic;
+}
+
+.history {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+}
```

Sửa `src/windows/main/Shell.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/Shell.tsx b/src/windows/main/Shell.tsx
--- a/src/windows/main/Shell.tsx
+++ b/src/windows/main/Shell.tsx
@@ -4,15 +4,17 @@
 import { Notice } from "./Notice";
 import { About } from "./screens/About";
 import { Home } from "./screens/Home";
-import { Glossary, History, Transcript, Upgrade } from "./screens/Placeholders";
+import { HistoryScreen } from "./screens/HistoryScreen";
+import { Glossary, Upgrade } from "./screens/Placeholders";
 import { SettingsScreen } from "./screens/SettingsScreen";
+import { TranscriptScreen } from "./screens/TranscriptScreen";
 
 const SCREENS: readonly Screen[] = ["home", "transcript", "history", "glossary", "settings", "upgrade", "about"];
 
 const BODIES: Record<Screen, () => React.JSX.Element | null> = {
   home: Home,
-  transcript: Transcript,
-  history: History,
+  transcript: TranscriptScreen,
+  history: HistoryScreen,
   glossary: Glossary,
   settings: SettingsScreen,
   upgrade: Upgrade,
```

Tạo `src/windows/main/TranscriptView.tsx`:

```tsx
import { useState } from "react";
import { errorKey } from "../../i18n";
import type { ExportFormat, SrtText, Transcript, TranscriptRef } from "../../lib/ipc";
import { clockTime, lineView, localOffsetMinutes } from "../../lib/subtitleView";
import { searchLines } from "../../store/transcript";
import { useApp, useT } from "./appStore";
import { useTranscript } from "./dataStores";

// Một bản chép lời (§4.3): mỗi câu có giờ, câu gốc và bản dịch; tìm kiếm; sao chép (mọi gói); xuất TXT, SRT, Markdown
// (Pro). Dùng cho phiên hiện tại (màn hình Bản chép lời) và cho một phiên trong Lịch sử.
export function TranscriptView({ transcript, source }: { transcript: Transcript; source: TranscriptRef }) {
  const t = useT();
  const pro = useApp((s) => s.status?.pro ?? false);
  const navigate = useApp((s) => s.navigate);
  const copy = useTranscript((s) => s.copy);
  const exportTo = useTranscript((s) => s.exportTo);
  const notice = useTranscript((s) => s.notice);
  const error = useTranscript((s) => s.error);
  const dismiss = useTranscript((s) => s.dismiss);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [srtText, setSrtText] = useState<SrtText>("translation");
  const offset = localOffsetMinutes();
  const lines = searchLines(transcript.lines, query);
  return (
    <>
      <div className="card">
        <div className="row">
          <label htmlFor="transcript-search">{t("transcript.search")}</label>
          <input
            id="transcript-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("transcript.search.placeholder")}
          />
          <button onClick={() => void copy(source)} disabled={transcript.lines.length === 0}>
            {t("transcript.copy")}
          </button>
        </div>
        <div className="row">
          <label htmlFor="export-format">{t("transcript.export")}</label>
          <select id="export-format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="txt">TXT</option>
            <option value="srt">SRT</option>
            <option value="markdown">Markdown</option>
          </select>
          {format === "srt" && (
            <select
              aria-label={t("transcript.export.srtText")}
              value={srtText}
              onChange={(e) => setSrtText(e.target.value as SrtText)}
            >
              <option value="translation">{t("transcript.export.translation")}</option>
              <option value="source">{t("transcript.export.source")}</option>
            </select>
          )}
          <button
            disabled={!pro || transcript.lines.length === 0}
            onClick={() => void exportTo(source, format, srtText)}
          >
            {t("transcript.export.button")}
          </button>
          {!pro && (
            <button className="link" onClick={() => navigate("upgrade")}>
              {t("pro.upgrade")}
            </button>
          )}
        </div>
        {!pro && <p className="hint">{t("transcript.export.pro")}</p>}
        <div role="status">
          {notice?.kind === "copied" && <p className="hint">{t("transcript.copied")}</p>}
          {notice?.kind === "exported" && <p className="hint">{t("transcript.exported", { path: notice.path })}</p>}
        </div>
        <div role="alert">
          {error && (
            <div className="notice error">
              <span>{t(errorKey(error.code))}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
        </div>
      </div>
      {transcript.lines.length > 0 && lines.length === 0 && <p className="empty">{t("transcript.noMatch")}</p>}
      <ol className="transcript">
        {lines.map((l) => {
          const v = lineView(l, true);
          const translation =
            v.kind === "translated" || v.kind === "translating" ? v.main : v.kind === "failed" ? t("subtitle.failed") : null;
          return (
            <li key={l.id} className={`${v.kind}${v.provisional ? " provisional" : ""}`}>
              <time>{clockTime(transcript.startedAt + l.start_ms, offset)}</time>
              <div>
                <div className="src" lang={l.src_lang}>
                  {v.kind === "dropped" ? t("subtitle.dropped") : l.src_text}
                </div>
                {translation && <div className="tgt">{translation}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
```

Tạo `src/windows/main/dataStores.ts`:

```ts
import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import { type GlossaryStoreState, type HistoryStoreState, createGlossaryStore, createHistoryStore } from "../../store/library";
import { type TranscriptStoreState, createTranscriptStore } from "../../store/transcript";

// Sao chép vào clipboard. `navigator.clipboard` cần trang an toàn và thao tác của người dùng; webview cũ không có thì
// dùng cách cũ (`execCommand("copy")` trên một ô ẩn).
async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw { code: "copyFailed", field: null, message: "clipboard" };
  }
}

// Store dữ liệu của cửa sổ chính, nối với lõi Rust thật. Bản chép lời nghe sự kiện từ lúc mở cửa sổ (`main.tsx`), để
// không sót câu nào khi màn hình Bản chép lời chưa mở.
export const transcriptStore = createTranscriptStore({ ipc: tauriIpc, writeClipboard });
export const historyStore = createHistoryStore(tauriIpc);
export const glossaryStore = createGlossaryStore(tauriIpc);

export function useTranscript<T>(selector: (state: TranscriptStoreState) => T): T {
  return useStore(transcriptStore, selector);
}

export function useHistory<T>(selector: (state: HistoryStoreState) => T): T {
  return useStore(historyStore, selector);
}

export function useGlossary<T>(selector: (state: GlossaryStoreState) => T): T {
  return useStore(glossaryStore, selector);
}
```

Sửa `src/windows/main/main.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/main.tsx b/src/windows/main/main.tsx
--- a/src/windows/main/main.tsx
+++ b/src/windows/main/main.tsx
@@ -4,6 +4,7 @@
 import { translate } from "../../i18n";
 import { App } from "./App";
 import { appStore, fallbackLanguage } from "./appStore";
+import { transcriptStore } from "./dataStores";
 
 // Giao diện sáng/tối và thuộc tính `lang` theo cài đặt, đổi ngay khi cài đặt đổi.
 appStore.subscribe((state) => {
@@ -22,6 +23,12 @@
   </StrictMode>,
 );
 
+// Bản chép lời nghe sự kiện phụ đề từ lúc mở cửa sổ, kể cả khi màn hình Bản chép lời chưa mở.
+transcriptStore
+  .getState()
+  .init()
+  .catch((e: unknown) => console.error("không đọc được bản chép lời", e));
+
 // Không đọc được cài đặt hay trạng thái (lệnh bị chặn, phía Rust lỗi) thì hiện câu báo theo ngôn ngữ của hệ
 // điều hành, thay vì để cửa sổ trắng trơn.
 appStore
```

Tạo `src/windows/main/screens/HistoryScreen.tsx`:

```tsx
import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/EmptyState";
import { ProLocked } from "../../../components/ProLocked";
import { errorKey } from "../../../i18n";
import { dateTime, localOffsetMinutes } from "../../../lib/subtitleView";
import { useApp, useT } from "../appStore";
import { useHistory } from "../dataStores";
import { TranscriptView } from "../TranscriptView";

// Lịch sử (F4, Pro): danh sách phiên đã lưu, mới nhất trước; mở xem lại (cùng giao diện với Bản chép lời); xóa từng phiên;
// xóa tất cả có bước xác nhận. Gói Free thì khóa, kèm nút Nâng cấp.
export function HistoryScreen() {
  const t = useT();
  const pro = useApp((s) => s.status?.pro ?? false);
  const saveHistory = useApp((s) => s.settings?.saveHistory ?? false);
  const navigate = useApp((s) => s.navigate);
  const sessions = useHistory((s) => s.sessions);
  const open = useHistory((s) => s.open);
  const error = useHistory((s) => s.error);
  const load = useHistory((s) => s.load);
  const openSession = useHistory((s) => s.openSession);
  const close = useHistory((s) => s.close);
  const remove = useHistory((s) => s.remove);
  const clearAll = useHistory((s) => s.clearAll);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (pro) void load();
  }, [pro, load]);
  if (!pro) return <ProLocked text={t("history.pro")} upgradeLabel={t("pro.upgrade")} onUpgrade={() => navigate("upgrade")} />;
  const offset = localOffsetMinutes();
  if (open) {
    return (
      <>
        <div className="row">
          <button onClick={close}>{t("history.back")}</button>
          <span>{dateTime(open.transcript.startedAt, offset)}</span>
        </div>
        <TranscriptView transcript={open.transcript} source={{ kind: "history", id: open.id }} />
      </>
    );
  }
  return (
    <>
      <div role="alert">{error && <p className="error-text">{t(errorKey(error.code))}</p>}</div>
      {!saveHistory && (
        <div className="notice">
          <span>{t("history.off")}</span>
          <button onClick={() => navigate("settings", "privacy")}>{t("notice.openSettings")}</button>
        </div>
      )}
      {sessions && sessions.length === 0 && <EmptyState text={t("history.empty")} />}
      {sessions && sessions.length > 0 && (
        <>
          <ul className="history">
            {sessions.map((s) => (
              <li key={s.id} className="card">
                <div className="row">
                  <strong>{dateTime(s.startedAt, offset)}</strong>
                  <span className="hint">
                    {t("history.meta", { minutes: Math.max(1, Math.round((s.endedAt - s.startedAt) / 60_000)), lines: s.lines })}
                  </span>
                </div>
                <p>{s.preview}</p>
                <div className="row">
                  <button onClick={() => void openSession(s.id)}>{t("history.open")}</button>
                  <button onClick={() => void remove(s.id)}>{t("history.delete")}</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="row" role="status">
            {!confirming && <button onClick={() => setConfirming(true)}>{t("history.clear")}</button>}
            {confirming && (
              <>
                <span className="error-text">{t("history.clear.confirm")}</span>
                <button
                  className="danger"
                  onClick={() => {
                    setConfirming(false);
                    void clearAll();
                  }}
                >
                  {t("settings.privacy.clear.yes")}
                </button>
                <button onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
```

Sửa `src/windows/main/screens/Home.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/screens/Home.tsx b/src/windows/main/screens/Home.tsx
--- a/src/windows/main/screens/Home.tsx
+++ b/src/windows/main/screens/Home.tsx
@@ -3,6 +3,7 @@
 import type { SessionStatus } from "../../../lib/ipc";
 import { levelToMeter } from "../../../store/app";
 import { useApp, useT } from "../appStore";
+import { useTranscript } from "../dataStores";
 import { LanguagePicker } from "../LanguagePicker";
 
 const BADGE: Record<SessionStatus, MessageKey> = {
@@ -34,6 +35,7 @@
   const setLocked = useApp((s) => s.setOverlayLocked);
   const navigate = useApp((s) => s.navigate);
   const openPermission = useApp((s) => s.openAudioPermissionSettings);
+  const hasTranscript = useTranscript((s) => (s.transcript?.lines.length ?? 0) > 0);
   if (!status || !settings || !info) return null;
   const session = status.session;
   const notes: MessageKey[] = [];
@@ -74,6 +76,12 @@
             {t(key)}
           </p>
         ))}
+        {/* Dừng xong thì mở được bản chép lời của phiên (§4.2 bước 3). */}
+        {session !== "running" && session !== "starting" && hasTranscript && (
+          <div className="row">
+            <button onClick={() => navigate("transcript")}>{t("home.openTranscript")}</button>
+          </div>
+        )}
       </div>
       <div className="card">
         <h2>{t("home.languages")}</h2>
```

Sửa `src/windows/main/screens/Placeholders.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/screens/Placeholders.tsx b/src/windows/main/screens/Placeholders.tsx
--- a/src/windows/main/screens/Placeholders.tsx
+++ b/src/windows/main/screens/Placeholders.tsx
@@ -1,15 +1,7 @@
 import { EmptyState } from "../../../components/EmptyState";
 import { useT } from "../appStore";
 
-// Khung các màn hình mà kế hoạch sau làm nội dung: bản chép lời, lịch sử, từ điển (03), nâng cấp Pro (06).
-export function Transcript() {
-  return <EmptyState text={useT()("transcript.empty")} />;
-}
-
-export function History() {
-  return <EmptyState text={useT()("history.empty")} />;
-}
-
+// Khung các màn hình mà kế hoạch sau làm nội dung: từ điển (03, task sau), nâng cấp Pro (06).
 export function Glossary() {
   return <EmptyState text={useT()("glossary.empty")} />;
 }
```

Tạo `src/windows/main/screens/TranscriptScreen.tsx`:

```tsx
import { EmptyState } from "../../../components/EmptyState";
import { useT } from "../appStore";
import { useTranscript } from "../dataStores";
import { TranscriptView } from "../TranscriptView";

// Màn hình Bản chép lời (F4): phiên đang dịch, hoặc phiên vừa dừng (bản trong bộ nhớ, §6.6).
export function TranscriptScreen() {
  const t = useT();
  const transcript = useTranscript((s) => s.transcript);
  if (!transcript || transcript.lines.length === 0) return <EmptyState text={t("transcript.empty")} />;
  return <TranscriptView transcript={transcript} source={{ kind: "current" }} />;
}
```

- [ ] **Step 2: Chạy test**

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  8 passed (8)
      Tests  89 passed (89)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ProLocked.tsx \
  src/i18n/en.ts \
  src/i18n/vi.ts \
  src/styles/main.css \
  src/windows/main/Shell.tsx \
  src/windows/main/TranscriptView.tsx \
  src/windows/main/dataStores.ts \
  src/windows/main/main.tsx \
  src/windows/main/screens/HistoryScreen.tsx \
  src/windows/main/screens/Home.tsx \
  src/windows/main/screens/Placeholders.tsx \
  src/windows/main/screens/TranscriptScreen.tsx
git commit -m "feat(ui): màn hình Bản chép lời và Lịch sử: tìm, sao chép, xuất file, xem lại và xóa phiên đã lưu (F4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 5: Màn hình Từ điển thuật ngữ

Dòng 19, 49. Pro (`ProLocked` ở gói Free). Số thuật ngữ trên 500; dòng thêm mới; sửa và xóa từng dòng; lỗi của ô (trùng, rỗng, quá dài, ký tự xuống dòng) hiện ngay dưới dòng đang sửa, gắn vào ô bằng `aria-describedby`; đủ 500 thì ẩn dòng thêm. Nhập CSV (báo số dòng thêm, cập nhật, bỏ qua, vượt giới hạn) và xuất CSV (báo đường dẫn), qua hộp thoại của hệ điều hành.

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/styles/main.css`
- Modify: `src/windows/main/Shell.tsx`
- Create: `src/windows/main/screens/GlossaryScreen.tsx`
- Modify: `src/windows/main/screens/Placeholders.tsx`

- [ ] **Step 1: Viết code**

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -81,6 +81,17 @@
   "history.clear": "Delete all sessions",
   "history.clear.confirm": "Delete every saved session? This cannot be undone.",
   "glossary.pro": "The glossary is a Pro feature: your terms are used when translating.",
+  "glossary.hint": "Terms found in a sentence are given to the translator, so it uses your translation. Matching ignores case; Chinese, Japanese and Korean terms also match inside words.",
+  "glossary.count": "{n} of {max} terms",
+  "glossary.source": "Term",
+  "glossary.target": "Translation",
+  "glossary.add": "Add",
+  "glossary.save": "Save",
+  "glossary.edit": "Edit",
+  "glossary.import": "Import CSV…",
+  "glossary.export": "Export CSV…",
+  "glossary.csvHint": "CSV with two columns, term and translation, in UTF-8. Existing terms get the translation from the file.",
+  "glossary.imported": "Imported: {added} added, {updated} updated, {skipped} rows skipped, {overLimit} over the 500-term limit.",
   "pro.upgrade": "Upgrade to Pro",
 
   "settings.group.general": "General",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -81,6 +81,17 @@
   "history.clear": "Xóa tất cả các phiên",
   "history.clear.confirm": "Xóa mọi phiên đã lưu? Không khôi phục được.",
   "glossary.pro": "Từ điển thuật ngữ là tính năng Pro: thuật ngữ của bạn được dùng khi dịch.",
+  "glossary.hint": "Thuật ngữ có trong câu được đưa cho bộ dịch, để dùng đúng bản dịch của bạn. Không phân biệt hoa thường; thuật ngữ tiếng Trung, Nhật, Hàn khớp cả khi nằm giữa từ.",
+  "glossary.count": "{n}/{max} thuật ngữ",
+  "glossary.source": "Thuật ngữ",
+  "glossary.target": "Bản dịch",
+  "glossary.add": "Thêm",
+  "glossary.save": "Lưu",
+  "glossary.edit": "Sửa",
+  "glossary.import": "Nhập CSV…",
+  "glossary.export": "Xuất CSV…",
+  "glossary.csvHint": "File CSV hai cột, thuật ngữ và bản dịch, mã UTF-8. Thuật ngữ đã có thì lấy bản dịch trong file.",
+  "glossary.imported": "Đã nhập: thêm {added}, cập nhật {updated}, bỏ qua {skipped} dòng, {overLimit} dòng vượt giới hạn 500.",
   "pro.upgrade": "Nâng cấp Pro",
 
   "settings.group.general": "Chung",
```

Sửa `src/styles/main.css` (áp bằng `git apply`):

```diff
diff --git a/src/styles/main.css b/src/styles/main.css
--- a/src/styles/main.css
+++ b/src/styles/main.css
@@ -291,3 +291,13 @@
   margin: 0;
   padding: 0;
 }
+
+.glossary {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+}
+
+.glossary .term {
+  min-width: 12rem;
+}
```

Sửa `src/windows/main/Shell.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/Shell.tsx b/src/windows/main/Shell.tsx
--- a/src/windows/main/Shell.tsx
+++ b/src/windows/main/Shell.tsx
@@ -4,8 +4,9 @@
 import { Notice } from "./Notice";
 import { About } from "./screens/About";
 import { Home } from "./screens/Home";
+import { GlossaryScreen } from "./screens/GlossaryScreen";
 import { HistoryScreen } from "./screens/HistoryScreen";
-import { Glossary, Upgrade } from "./screens/Placeholders";
+import { Upgrade } from "./screens/Placeholders";
 import { SettingsScreen } from "./screens/SettingsScreen";
 import { TranscriptScreen } from "./screens/TranscriptScreen";
 
@@ -15,7 +16,7 @@
   home: Home,
   transcript: TranscriptScreen,
   history: HistoryScreen,
-  glossary: Glossary,
+  glossary: GlossaryScreen,
   settings: SettingsScreen,
   upgrade: Upgrade,
   about: About,
```

Tạo `src/windows/main/screens/GlossaryScreen.tsx`:

```tsx
import { useEffect, useState } from "react";
import { ProLocked } from "../../../components/ProLocked";
import { errorKey } from "../../../i18n";
import type { GlossaryEntry } from "../../../lib/ipc";
import type { UiError } from "../../../store/app";
import { MAX_GLOSSARY } from "../../../store/library";
import { useApp, useT } from "../appStore";
import { useGlossary } from "../dataStores";

// Một dòng đang thêm hay đang sửa: hai ô, lỗi của ô (chữ nguồn trùng, rỗng, quá dài) hiện ngay dưới dòng.
function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { source: string; target: string };
  submitLabel: string;
  onSubmit: (source: string, target: string) => Promise<UiError | null>;
  onCancel?: () => void;
}) {
  const t = useT();
  const [source, setSource] = useState(initial.source);
  const [target, setTarget] = useState(initial.target);
  const [error, setError] = useState<UiError | null>(null);
  const [sending, setSending] = useState(false);
  const errorId = `glossary-error-${initial.source || "new"}`;
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (sending) return;
        setSending(true);
        void onSubmit(source, target).then((err) => {
          setSending(false);
          setError(err);
          if (!err && !onCancel) {
            setSource("");
            setTarget("");
          }
        });
      }}
    >
      <input
        type="text"
        aria-label={t("glossary.source")}
        placeholder={t("glossary.source")}
        value={source}
        maxLength={200}
        aria-invalid={error?.field === "source"}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setSource(e.target.value)}
      />
      <input
        type="text"
        aria-label={t("glossary.target")}
        placeholder={t("glossary.target")}
        value={target}
        maxLength={200}
        aria-invalid={error?.field === "target"}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setTarget(e.target.value)}
      />
      <button type="submit" className="primary" disabled={sending}>
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      )}
      {error && (
        <span id={errorId} className="error-text" role="alert">
          {t(errorKey(error.code))}
        </span>
      )}
    </form>
  );
}

// Từ điển thuật ngữ (F5, Pro): tối đa 500 cặp; thêm, sửa, xóa; nhập và xuất CSV (hai cột `source,target`, UTF-8).
// Thuật ngữ có trong câu được đưa vào prompt khi dịch (§6.5). Gói Free thì khóa, kèm nút Nâng cấp.
export function GlossaryScreen() {
  const t = useT();
  const pro = useApp((s) => s.status?.pro ?? false);
  const navigate = useApp((s) => s.navigate);
  const entries = useGlossary((s) => s.entries);
  const error = useGlossary((s) => s.error);
  const report = useGlossary((s) => s.report);
  const exported = useGlossary((s) => s.exported);
  const load = useGlossary((s) => s.load);
  const add = useGlossary((s) => s.add);
  const update = useGlossary((s) => s.update);
  const remove = useGlossary((s) => s.remove);
  const importCsv = useGlossary((s) => s.importCsv);
  const exportCsv = useGlossary((s) => s.exportCsv);
  const dismiss = useGlossary((s) => s.dismiss);
  const [editing, setEditing] = useState<number | null>(null);
  useEffect(() => {
    if (pro) void load();
  }, [pro, load]);
  if (!pro) return <ProLocked text={t("glossary.pro")} upgradeLabel={t("pro.upgrade")} onUpgrade={() => navigate("upgrade")} />;
  const list: GlossaryEntry[] = entries ?? [];
  const full = list.length >= MAX_GLOSSARY;
  return (
    <>
      <div className="card">
        <p className="hint">{t("glossary.hint")}</p>
        <p>{t("glossary.count", { n: list.length, max: MAX_GLOSSARY })}</p>
        {!full && (
          <EntryForm initial={{ source: "", target: "" }} submitLabel={t("glossary.add")} onSubmit={add} />
        )}
        {full && <p className="hint">{t("error.glossaryFull")}</p>}
        <div className="row">
          <button onClick={() => void importCsv()}>{t("glossary.import")}</button>
          <button onClick={() => void exportCsv()} disabled={list.length === 0}>
            {t("glossary.export")}
          </button>
        </div>
        <p className="hint">{t("glossary.csvHint")}</p>
        <div role="status">
          {report && (
            <div className="notice">
              <span>{t("glossary.imported", { ...report })}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
          {exported && (
            <div className="notice">
              <span>{t("transcript.exported", { path: exported })}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
        </div>
        <div role="alert">
          {error && (
            <div className="notice error">
              <span>{t(errorKey(error.code))}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
        </div>
      </div>
      <ul className="glossary">
        {list.map((e) =>
          editing === e.id ? (
            <li key={e.id}>
              <EntryForm
                initial={e}
                submitLabel={t("glossary.save")}
                onSubmit={async (source, target) => {
                  const err = await update(e.id, source, target);
                  if (!err) setEditing(null);
                  return err;
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={e.id} className="row">
              <span className="term">{e.source}</span>
              <span aria-hidden="true">→</span>
              <span className="term">{e.target}</span>
              <button onClick={() => setEditing(e.id)}>{t("glossary.edit")}</button>
              <button onClick={() => void remove(e.id)}>{t("history.delete")}</button>
            </li>
          ),
        )}
      </ul>
    </>
  );
}
```

Sửa `src/windows/main/screens/Placeholders.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/screens/Placeholders.tsx b/src/windows/main/screens/Placeholders.tsx
--- a/src/windows/main/screens/Placeholders.tsx
+++ b/src/windows/main/screens/Placeholders.tsx
@@ -1,11 +1,7 @@
 import { EmptyState } from "../../../components/EmptyState";
 import { useT } from "../appStore";
 
-// Khung các màn hình mà kế hoạch sau làm nội dung: từ điển (03, task sau), nâng cấp Pro (06).
-export function Glossary() {
-  return <EmptyState text={useT()("glossary.empty")} />;
-}
-
+// Khung màn hình mà kế hoạch 06 làm nội dung: nâng cấp Pro.
 export function Upgrade() {
   return <EmptyState text={useT()("upgrade.empty")} />;
 }
```

- [ ] **Step 2: Chạy test**

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  8 passed (8)
      Tests  89 passed (89)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.ts \
  src/i18n/vi.ts \
  src/styles/main.css \
  src/windows/main/Shell.tsx \
  src/windows/main/screens/GlossaryScreen.tsx \
  src/windows/main/screens/Placeholders.tsx
git commit -m "feat(ui): màn hình Từ điển thuật ngữ: thêm, sửa, xóa, nhập và xuất CSV (F5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 6: Bước "Nghe thử" và bảng debug ẩn

Dòng 40, 222; QĐ20, QĐ21.

- `scripts/make_listen_test.py` cắt câu tiếng Anh thứ hai của clip test FLEURS có sẵn ra `public/listen-test-en.wav` (5 giây, 16 kHz mono, khoảng 156 KB, Vite chép vào `dist/`), chạy lại cho ra đúng các byte cũ; `public/listen-test-en.LICENSE.txt` ghi công (CC BY 4.0). 07 đưa câu này vào `THIRD_PARTY_NOTICES`.
- Bước 6 của lần đầu mở (`ListenTest`): bấm "Phát câu mẫu" thì gọi `start_listen_test`, chờ phiên chạy (có thể đang nạp model), rồi phát câu mẫu bằng `<audio>`; bản dịch hiện trên thanh phụ đề và ngay trong bước; phát xong 6 giây thì tự dừng; rời bước thì dừng phiên của bước.
- Bảng debug (`DebugPanel`) ở màn hình Giới thiệu, hiện khi bấm 5 lần vào dòng phiên bản.

**Files:**
- Create: `public/listen-test-en.LICENSE.txt`
- Create: `public/listen-test-en.wav` (sinh bằng script, không chép tay)
- Create: `scripts/make_listen_test.py`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/styles/main.css`
- Create: `src/windows/main/DebugPanel.tsx`
- Create: `src/windows/main/onboarding/ListenTest.tsx`
- Modify: `src/windows/main/onboarding/Onboarding.tsx`
- Modify: `src/windows/main/screens/About.tsx`

- [ ] **Step 1: Viết code**

Tạo `public/listen-test-en.LICENSE.txt`:

```text
listen-test-en.wav: câu "The result of plotting analysis will be posted to a public website." (en-6415341913845555034)
của bộ dữ liệu FLEURS (tập dev). Conneau và cộng sự, "FLEURS: Few-shot Learning Evaluation of Universal Representations
of Speech", 2022, Google. Giấy phép Creative Commons Attribution 4.0 (CC BY 4.0),
https://creativecommons.org/licenses/by/4.0/. Bản ở đây đã được sửa: cắt lặng đầu cuối, rồi cắt riêng câu này kèm 0,3
giây lặng ở hai đầu (scripts/make_listen_test.py).
```

Tạo `scripts/make_listen_test.py`:

```python
"""Dựng câu mẫu của bước "Nghe thử" (spec §4.1 bước 6, kế hoạch 03): cắt câu tiếng Anh thứ hai của
tests/fixtures/audio/fleurs-en-en-vi.wav (FLEURS, CC BY 4.0) ra public/listen-test-en.wav, kèm 0,3 giây lặng ở hai đầu.

Dùng (từ gốc repo): python3 scripts/make_listen_test.py
Chạy lại cho ra đúng các byte cũ.
"""
import json
import os
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "audio")
OUT = os.path.join(ROOT, "public", "listen-test-en.wav")
CLIP = "en-6415341913845555034"
PAD_MS = 300


def main():
    truth = {r["id"]: r for r in json.load(open(os.path.join(FIXTURE, "fleurs-en-en-vi.json"), encoding="utf-8"))}
    row = truth[CLIP]
    with wave.open(os.path.join(FIXTURE, "fleurs-en-en-vi.wav")) as w:
        rate = w.getframerate()
        assert (w.getnchannels(), w.getsampwidth()) == (1, 2)
        start = (row["start_ms"] - PAD_MS) * rate // 1000
        end = (row["end_ms"] + PAD_MS) * rate // 1000
        w.setpos(start)
        frames = w.readframes(end - start)
    with wave.open(OUT, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(frames)
    print(f"{os.path.relpath(OUT, ROOT)}: {(end - start) / rate:.2f} giây, \"{row['ref']}\"")


if __name__ == "__main__":
    main()
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -148,6 +148,16 @@
   "about.licenses": "Open-source licenses",
   "about.licensesPending": "The list of open-source licenses will appear here.",
   "about.trademark": "Microsoft Teams, Zoom and Google Meet are mentioned only to describe compatibility. AI Translator is not affiliated with these companies.",
+  "debug.title": "Diagnostics",
+  "debug.refresh": "Refresh",
+  "debug.empty": "No finished session yet in this run of the app.",
+  "debug.status": "Session: {session} · loading: {loading} · CPU: {cpu} · Pro: {pro}",
+  "debug.session": "Session {n}, ended {time}",
+  "debug.stage": "Step",
+  "debug.stage.vad": "Sentence cut",
+  "debug.stage.asr": "Speech recognition",
+  "debug.stage.mt": "Translation",
+  "debug.stage.total": "Total delay",
 
   "onboarding.step": "Step {n} of {total}",
   "onboarding.next": "Next",
@@ -160,6 +170,10 @@
   "onboarding.permission.body": "macOS asks for permission the first time you start translating. If you refused, turn on AI Translator in System Settings › Privacy & Security › Screen & System Audio Recording, under System Audio Recording Only.",
   "onboarding.languages.title": "Choose your languages",
   "onboarding.test.title": "Try it",
+  "onboarding.test.body": "Press the button: AI Translator plays an English sentence through your speakers, and its subtitle should appear on the subtitle bar. Turn the volume up if it is muted.",
+  "onboarding.test.play": "Play a sample sentence",
+  "onboarding.test.ok": "It works. Translation:",
+  "onboarding.test.nothing": "No subtitle yet. Check that the speakers are not muted, then try again. On macOS, allow system audio recording if asked.",
   "onboarding.privacy.title": "Your privacy",
   "onboarding.privacy.local": "Audio never leaves this computer: speech recognition and translation run entirely on your machine.",
   "onboarding.privacy.notify": "If the law or your company requires it, you are responsible for telling other participants that you use a translation tool.",
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -148,6 +148,16 @@
   "about.licenses": "Giấy phép mã nguồn mở",
   "about.licensesPending": "Danh sách giấy phép mã nguồn mở sẽ hiện ở đây.",
   "about.trademark": "Microsoft Teams, Zoom và Google Meet chỉ được nhắc tới để mô tả khả năng tương thích. AI Translator không liên kết với các công ty này.",
+  "debug.title": "Chẩn đoán",
+  "debug.refresh": "Làm mới",
+  "debug.empty": "Chưa có phiên nào kết thúc trong lần chạy này của app.",
+  "debug.status": "Phiên: {session} · đang nạp: {loading} · CPU: {cpu} · Pro: {pro}",
+  "debug.session": "Phiên {n}, kết thúc lúc {time}",
+  "debug.stage": "Bước",
+  "debug.stage.vad": "Cắt câu",
+  "debug.stage.asr": "Nhận dạng giọng nói",
+  "debug.stage.mt": "Dịch",
+  "debug.stage.total": "Độ trễ tổng",
 
   "onboarding.step": "Bước {n}/{total}",
   "onboarding.next": "Tiếp",
@@ -160,6 +170,10 @@
   "onboarding.permission.body": "macOS hỏi quyền ở lần đầu bạn bắt đầu dịch. Nếu đã từ chối, hãy bật AI Translator trong System Settings › Privacy & Security › Screen & System Audio Recording, ở mục System Audio Recording Only.",
   "onboarding.languages.title": "Chọn ngôn ngữ",
   "onboarding.test.title": "Nghe thử",
+  "onboarding.test.body": "Bấm nút: AI Translator phát một câu tiếng Anh qua loa, và phụ đề của câu đó sẽ hiện trên thanh phụ đề. Tăng âm lượng nếu đang tắt tiếng.",
+  "onboarding.test.play": "Phát câu mẫu",
+  "onboarding.test.ok": "Đã chạy. Bản dịch:",
+  "onboarding.test.nothing": "Chưa thấy phụ đề. Kiểm tra loa không bị tắt tiếng rồi thử lại. Trên macOS, hãy cho phép ghi âm thanh hệ thống nếu được hỏi.",
   "onboarding.privacy.title": "Quyền riêng tư",
   "onboarding.privacy.local": "Âm thanh không rời khỏi máy: nhận dạng giọng nói và dịch đều chạy trên máy của bạn.",
   "onboarding.privacy.notify": "Nếu pháp luật hoặc quy định công ty yêu cầu, bạn tự chịu trách nhiệm thông báo cho người cùng họp là bạn dùng công cụ dịch.",
```

Sửa `src/styles/main.css` (áp bằng `git apply`):

```diff
diff --git a/src/styles/main.css b/src/styles/main.css
--- a/src/styles/main.css
+++ b/src/styles/main.css
@@ -301,3 +301,15 @@
 .glossary .term {
   min-width: 12rem;
 }
+
+.debug table {
+  border-collapse: collapse;
+  font-variant-numeric: tabular-nums;
+}
+
+.debug th,
+.debug td {
+  padding: 0.2rem 0.75rem;
+  border-bottom: 1px solid var(--color-border);
+  text-align: left;
+}
```

Tạo `src/windows/main/DebugPanel.tsx`:

```tsx
import { useEffect } from "react";
import { dateTime, localOffsetMinutes } from "../../lib/subtitleView";
import { useApp, useT } from "./appStore";

const ms = (v: number | null) => (v === null ? "–" : `${Math.round(v)} ms`);

// Bảng debug ẩn (§7): số đo của các phiên gần nhất trong lần chạy này (thời gian cắt đoạn, nhận dạng, dịch, tổng thể;
// số câu theo loại), để hỗ trợ khi người dùng báo lỗi. Không có chữ chép lời. Mở bằng cách bấm 5 lần vào dòng phiên bản ở
// màn hình Giới thiệu.
export function DebugPanel() {
  const t = useT();
  const sessions = useApp((s) => s.debugSessions);
  const status = useApp((s) => s.status);
  const load = useApp((s) => s.loadDebugSessions);
  useEffect(() => {
    void load();
  }, [load]);
  const offset = localOffsetMinutes();
  return (
    <div className="card debug">
      <h2>{t("debug.title")}</h2>
      {status && (
        <p className="hint">
          {t("debug.status", {
            session: status.session,
            loading: status.loading ?? "–",
            cpu: String(status.cpuFallback),
            pro: String(status.pro),
          })}
        </p>
      )}
      <button onClick={() => void load()}>{t("debug.refresh")}</button>
      {sessions && sessions.length === 0 && <p className="hint">{t("debug.empty")}</p>}
      {sessions?.map((s) => (
        <div key={s.session}>
          <h3>{t("debug.session", { n: s.session, time: dateTime(s.endedAt, offset) })}</h3>
          <table>
            <thead>
              <tr>
                <th>{t("debug.stage")}</th>
                <th>n</th>
                <th>p50</th>
                <th>p90</th>
              </tr>
            </thead>
            <tbody>
              {s.stages.map((st) => (
                <tr key={st.name}>
                  <td>{t(`debug.stage.${st.name}`)}</td>
                  <td>{st.count}</td>
                  <td>{ms(st.p50)}</td>
                  <td>{ms(st.p90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">{s.summary}</p>
        </div>
      ))}
    </div>
  );
}
```

Tạo `src/windows/main/onboarding/ListenTest.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { errorKey } from "../../../i18n";
import { appStore, useApp, useT } from "../appStore";
import { useTranscript } from "../dataStores";

// Câu mẫu, dựng bằng `scripts/make_listen_test.py` (FLEURS, CC BY 4.0, xem `public/listen-test-en.LICENSE.txt`).
const SAMPLE = "/listen-test-en.wav";
// Phát xong câu mẫu thì chờ chừng này cho câu cuối dịch xong, rồi dừng phiên.
const SETTLE_MS = 6_000;

// Bước 6 "Nghe thử" (§4.1): bấm thì bắt đầu một phiên thu toàn hệ thống kể cả âm thanh của chính app
// (`start_listen_test`, Đ16), chờ phiên chạy (có thể đang nạp model), rồi phát câu tiếng Anh mẫu qua loa. Phụ đề hiện
// trên thanh phụ đề và ở đây. Phát xong vài giây thì tự dừng; rời bước này thì dừng phiên của bước này.
// Tiếng của webview đi qua tiến trình WebKit (macOS) hay WebView2 (Windows) chứ không qua tiến trình của app, nên được thu
// nhờ chế độ toàn hệ thống (ghi chú N8 của kế hoạch 02c).
export function ListenTest() {
  const t = useT();
  const status = useApp((s) => s.status);
  const pending = useApp((s) => s.sessionPending);
  const start = useApp((s) => s.startListenTest);
  const toggle = useApp((s) => s.toggleSession);
  const lines = useTranscript((s) => s.transcript?.lines ?? []);
  const audio = useRef<HTMLAudioElement>(null);
  const timer = useRef<number | null>(null);
  // Phiên đang chạy là của bước này (để chỉ dừng phiên của chính nó).
  const ours = useRef(false);
  const [played, setPlayed] = useState(false);
  const running = status?.session === "running";

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    audio.current?.pause();
    if (ours.current) {
      ours.current = false;
      void toggle();
    }
  };

  useEffect(() => () => stop(), []);

  const play = async () => {
    setPlayed(false);
    await start();
    // Phiên không chạy (lỗi, thiếu model, đã bấm Hủy): lỗi hiện bên dưới, không phát gì.
    if (appStore.getState().status?.session !== "running" || !audio.current) return;
    ours.current = true;
    audio.current.currentTime = 0;
    await audio.current.play().catch(() => {});
    setPlayed(true);
  };

  const done = lines.find((l) => l.status === "done" && l.tgt_text);
  return (
    <>
      <p>{t("onboarding.test.body")}</p>
      <audio
        ref={audio}
        src={SAMPLE}
        preload="auto"
        onEnded={() => {
          timer.current = window.setTimeout(stop, SETTLE_MS);
        }}
      />
      <div className="row">
        <button className="primary" disabled={pending || running} onClick={() => void play()}>
          {t("onboarding.test.play")}
        </button>
        {running && ours.current && <button onClick={stop}>{t("home.stop")}</button>}
        {status?.loading && <span className="hint">{t("overlay.note.loading")}</span>}
      </div>
      <div role="status">
        {done && (
          <p>
            {t("onboarding.test.ok")} <strong>{done.tgt_text}</strong>
          </p>
        )}
        {played && !done && !running && <p className="hint">{t("onboarding.test.nothing")}</p>}
      </div>
      <div role="alert">
        {status?.session === "error" && status.sessionError && (
          <p className="error-text">{t(errorKey(status.sessionError))}</p>
        )}
      </div>
    </>
  );
}
```

Sửa `src/windows/main/onboarding/Onboarding.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/onboarding/Onboarding.tsx b/src/windows/main/onboarding/Onboarding.tsx
--- a/src/windows/main/onboarding/Onboarding.tsx
+++ b/src/windows/main/onboarding/Onboarding.tsx
@@ -3,6 +3,7 @@
 import { useApp, useT } from "../appStore";
 import { LanguagePicker } from "../LanguagePicker";
 import { Notice } from "../Notice";
+import { ListenTest } from "./ListenTest";
 import { TaskbarGuide } from "./TaskbarGuide";
 
 // Các bước lần đầu mở app (§4.1). Kế hoạch 01 làm khung và các bước 1, 5, 7, 8; bước 2–3 do kế
@@ -102,6 +103,8 @@
       );
     case "languages":
       return <LanguagePicker />;
+    case "test":
+      return <ListenTest />;
     case "privacy":
       return (
         <>
```

Sửa `src/windows/main/screens/About.tsx` (áp bằng `git apply`):

```diff
diff --git a/src/windows/main/screens/About.tsx b/src/windows/main/screens/About.tsx
--- a/src/windows/main/screens/About.tsx
+++ b/src/windows/main/screens/About.tsx
@@ -1,17 +1,23 @@
+import { useState } from "react";
 import { useApp, useT } from "../appStore";
+import { DebugPanel } from "../DebugPanel";
+
+// Số lần bấm vào dòng phiên bản để mở bảng debug ẩn (§7).
+const DEBUG_CLICKS = 5;
 
 // Giới thiệu (§4.3): phiên bản, thư mục log (Đ10), câu miễn trừ nhãn hiệu (§10.1).
-// Kế hoạch 07 thêm danh sách giấy phép sinh từ `THIRD_PARTY_NOTICES`.
+// Kế hoạch 07 thêm danh sách giấy phép sinh từ `THIRD_PARTY_NOTICES`. Bấm 5 lần vào dòng phiên bản thì hiện bảng debug.
 export function About() {
   const t = useT();
   const info = useApp((s) => s.info);
   const openLogDir = useApp((s) => s.openLogDir);
+  const [clicks, setClicks] = useState(0);
   if (!info) return null;
   return (
     <>
       <div className="card">
         <h2>{info.name}</h2>
-        <p>{t("about.version", { version: info.version })}</p>
+        <p onClick={() => setClicks((n) => n + 1)}>{t("about.version", { version: info.version })}</p>
         <div className="row">
           <button onClick={() => void openLogDir()}>{t("about.openLogs")}</button>
         </div>
@@ -22,6 +28,7 @@
         <p className="hint">{t("about.licensesPending")}</p>
       </div>
       <p className="hint">{t("about.trademark")}</p>
+      {clicks >= DEBUG_CLICKS && <DebugPanel />}
     </>
   );
 }
```

Dựng câu mẫu bằng script (file WAV không chép vào kế hoạch):

Run:
```bash
python3 scripts/make_listen_test.py && shasum -a 256 public/listen-test-en.wav
```
Expected (lúc lập kế hoạch):
```text
public/listen-test-en.wav: 4.98 giây, "The result of plotting analysis will be posted to a public website."
98a6690171714977bd2c7ab7779036d126b3960e1c2185f2ba606e5c214b59b2  public/listen-test-en.wav
```

- [ ] **Step 2: Chạy test**

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  8 passed (8)
      Tests  89 passed (89)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

Run:
```bash
ls dist | sort
```
Expected (lúc lập kế hoạch):
```text
assets
index.html
listen-test-en.LICENSE.txt
listen-test-en.wav
overlay.html
```

- [ ] **Step 3: Commit**

```bash
git add public/listen-test-en.LICENSE.txt \
  public/listen-test-en.wav \
  scripts/make_listen_test.py \
  src/i18n/en.ts \
  src/i18n/vi.ts \
  src/styles/main.css \
  src/windows/main/DebugPanel.tsx \
  src/windows/main/onboarding/ListenTest.tsx \
  src/windows/main/onboarding/Onboarding.tsx \
  src/windows/main/screens/About.tsx
git commit -m "feat(ui): bước Nghe thử phát câu mẫu và hiện phụ đề; bảng debug ẩn ở màn hình Giới thiệu (§4.1 bước 6, §7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 7: Kiểm tra chuẩn (mục 6.2 của kế hoạch 00)

Đủ khối lệnh của mục 6.2 của kế hoạch 00, trên cây cuối của 03. Không có commit. Ba lệnh của `asr-worker` (clippy với `metal,shared-encode`, test với `shared-encode`, build release) và ba lệnh của `server/` không bị 03 đụng tới; vẫn chạy để chắc cây còn xanh.

- [ ] **Step 1: Rust**

Run:
```bash
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -q -- -D warnings 2>&1 | grep -E '^error' | head -3; echo "clippy: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
clippy: 0
```

Run:
```bash
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -q -- -D warnings 2>&1 | grep -E '^error' | head -3; echo "clippy asr-worker: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
clippy asr-worker: 0
```

Run:
```bash
cargo test --workspace 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
```
Expected (lúc lập kế hoạch; 03b không thêm test Rust):
```text
passed 557 failed 0 ignored 12
```

Run:
```bash
cargo test -p asr-worker --features shared-encode 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
```
Expected (lúc lập kế hoạch):
```text
passed 42 failed 0 ignored 1
```

Run:
```bash
cargo build --release -p asr-worker --features metal,shared-encode -q 2>&1 | grep -E '^error' | head -3; echo "build asr-worker: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
build asr-worker: 0
```

Run:
```bash
cargo deny check 2>&1 | tail -1 && cargo audit 2>&1 | grep -E '^(error|warning):'
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
warning: 3 allowed warnings found
```

- [ ] **Step 2: Giao diện**

Run:
```bash
pnpm install --frozen-lockfile >/dev/null 2>&1 && pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch; trên `main` `45de838` là 64 test trong 5 file):
```text
 Test Files  8 passed (8)
      Tests  89 passed (89)
```

Run:
```bash
pnpm audit 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
No known vulnerabilities found
```

- [ ] **Step 3: Kiểm code Windows trên Mac**

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

- [ ] **Step 4: License server (không đổi)**

Run:
```bash
pnpm -C server install --frozen-lockfile >/dev/null 2>&1 && NO_COLOR=1 pnpm -C server check 2>&1 | grep -E '^ +Tests |^# (pass|fail) ' && pnpm -C server audit 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
      Tests  360 passed (360)
# pass 6
# fail 0
No known vulnerabilities found
```

## Task 8: Thử tay trên Mac (cần người)

Bàn giao "chạy được" của 03 (mục 2.3 của kế hoạch 00) cần mắt người: thanh phụ đề trên app họp toàn màn hình, độ tương phản, bước "Nghe thử" với tiếng thật, hộp thoại lưu file, Keychain. Agent không tự chạy app và không bật hộp thoại quyền (mục 6.8 của kế hoạch 00): agent chuẩn bị, đưa từng bước cho người, ghi kết quả. Dòng 17, 25, 40, 68, 197, 301, và phần thử tay của 18, 19, 48, 49, 56, 314.

**Cần người thao tác:** cả task. Chạy app bằng `scripts/run-dev-app.sh` (gói `.app` ký bằng chứng thư cố định, R8, nên Keychain và quyền ghi âm thanh hệ thống không hỏi lại sau mỗi lần build). Đã làm 02c Task 1 Step 6 (tiến trình phụ trong `src-tauri/binaries/`).

**Files:**
- Create: `bench/phase0/results/gd1_03_mac.md`

- [ ] **Step 1: Agent chuẩn bị**

Run:
```bash
ls models/ggml-large-v3-turbo-q5_0.bin models/Hy-MT2-1.8B-Q8_0.gguf models/silero_vad_v6.2.3.onnx
ls src-tauri/binaries | wc -l
ls ~/Library/Application\ Support/com.aitranslator.desktop/ 2>/dev/null
```
Expected: ba file model; 12 file trong `binaries/`; thư mục dữ liệu chưa có `data.db` (lần thử đầu).

- [ ] **Step 2: Bước "Nghe thử"** (dòng 40)

Agent đặt lại cờ lần đầu mở: sửa `onboardingDone` thành `false` trong `~/Library/Application Support/com.aitranslator.desktop/settings.json` khi app đang tắt. Người mở app, đi tới bước "Thử" (bước 6), bật loa ở mức nghe được, bấm "Phát câu mẫu".
Expected:
- Lần đầu, macOS có thể hỏi quyền ghi âm thanh hệ thống (nếu chưa cấp ở 02c Task 8).
- Thanh phụ đề hiện; nếu model chưa nạp thì có "Đang nạp model…". Nghe câu "The result of plotting analysis will be posted to a public website."; trong khoảng 2 giây sau khi câu kết thúc, bản dịch tiếng Việt hiện trên thanh phụ đề và trong bước (dòng "Đã chạy. Bản dịch: …").
- Khoảng 6 giây sau khi phát xong, phiên tự dừng (màn hình chính về "Sẵn sàng" sau khi xong các bước).
- Tắt tiếng loa rồi bấm lại: không có phụ đề; bước hiện gợi ý kiểm tra loa.
- Cài đặt › Âm thanh đang chọn một app cụ thể (ví dụ Chrome): câu mẫu vẫn có phụ đề (bước này thu toàn hệ thống, QĐ20).
Ghi vào kết quả: thời gian từ lúc câu kết thúc tới lúc bản dịch hiện (ước lượng), và có hay không hộp thoại quyền.

- [ ] **Step 3: Thanh phụ đề** (dòng 17, 65–68, 73, 197, 219, 231)

Người phát video có người nói tiếng Anh, bấm Bắt đầu.
Expected:
- Chấm ở góc trên bên phải sáng xanh khi có tiếng, mờ khi lặng.
- Bật "Hiện câu gốc" (Cài đặt › Phụ đề): câu gốc chữ nhỏ ở trên bản dịch. Đổi cỡ chữ, số dòng (1, 2, 3), độ mờ nền (0% và 100%): thanh đổi ngay khi thả thanh trượt.
- Độ mờ nền 0%: chữ trắng viền tối vẫn đọc được trên nền trắng (ví dụ trang web nền trắng) và nền tối. Ghi nhận xét về độ tương phản (dòng 197).
- Câu đang dịch: chữ hiện dần; câu chưa chốt nhạt hơn rồi được thay.
- Tạm dừng video hơn 60 giây: thanh phụ đề hiện "Không nghe thấy âm thanh…" (nền đỏ).
- Khi chưa khóa: kéo thanh để di chuyển; kéo cạnh và góc của thanh để đổi kích thước (macOS dùng cạnh của chính cửa sổ, QĐ19). Không thu nhỏ được dưới khoảng 240 × 60 điểm. Ghi lại: kéo cạnh có được không, con trỏ có đổi không.
- Thoát app, mở lại, bắt đầu phiên: thanh ở đúng vị trí và kích thước cũ. Ẩn thanh bằng phím tắt rồi mở lại app: vẫn đúng vị trí (vị trí được nhớ cả lúc ẩn).
- Khóa thanh (phím tắt): click đi xuyên qua; vùng kéo cạnh không còn.
- Màn hình thứ hai (nếu có): kéo thanh sang, thoát rồi mở lại: thanh về màn hình đó; rút màn hình: thanh về màn hình chính.

- [ ] **Step 4: App họp toàn màn hình** (dòng 25, 301)

Người mở Zoom hoặc Google Meet (Chrome) ở chế độ toàn màn hình, phát tiếng (cuộc họp thử, hay chia sẻ một video).
Expected: thanh phụ đề nổi trên Space toàn màn hình của app họp, không lấy focus (gõ phím vào app họp vẫn được), chỉ báo và lời nhắc hiện đúng. Ghi tên app họp và kết quả.

- [ ] **Step 5: Bản chép lời, xuất file, Keychain** (dòng 18, 45, 47, 314)

- Bấm Dừng. Expected: màn hình chính có nút "Mở bản chép lời"; màn hình Bản chép lời có đủ các câu, có giờ địa phương; ô tìm lọc đúng (thử một từ có dấu); "Sao chép tất cả" rồi dán vào TextEdit: dạng `[giờ] câu gốc` rồi `→ bản dịch`.
- "Xuất…" lần lượt TXT, SRT (bản dịch, rồi câu gốc), Markdown. Expected: hộp thoại lưu của macOS có tên gợi ý `transcript-<ngày>-<giờ>.<đuôi>`; file mở đúng (Markdown xem bằng một trình xem Markdown: bảng ba cột). Bấm Hủy ở hộp thoại: không có thông báo lỗi.
- Bật Cài đặt › Quyền riêng tư › "Lưu lịch sử chép lời", chạy một phiên ngắn rồi Dừng. Expected: lần đầu dùng DB, macOS có thể hỏi quyền truy cập Keychain cho mục `com.aitranslator.desktop` (bấm Always Allow); ghi lại có hay không. Màn hình Lịch sử có phiên vừa rồi.
- Agent chạy `sqlite3 ~/Library/Application\ Support/com.aitranslator.desktop/data.db 'select count(*) from lines'`. Expected: `Error: file is not a database` (hoặc tương tự), không in số nào.

- [ ] **Step 6: Lịch sử, từ điển, xóa dữ liệu, Free** (dòng 19, 48, 49, 56)

- Lịch sử: mở phiên, xuất, xóa phiên, "Xóa tất cả các phiên" (có bước xác nhận).
- Từ điển: thêm `sprint` → `sprint` và `standup` → `họp đứng`; thêm lại `SPRINT` (báo trùng); xuất CSV, mở bằng Excel hoặc Numbers (tiếng Việt đúng); sửa file, nhập lại (báo số dòng). Phát một câu tiếng Anh có "sprint" và "standup" (ví dụ đọc to qua một video, hay dùng `say "The sprint ends on Friday, so the standup moves to nine."` trong Terminal khi đang dịch): bản dịch dùng thuật ngữ ở phần lớn lần thử (gói Nhẹ theo tốt hơn gói Chuẩn, điểm cần quyết 1 của 03a).
- Cài đặt › Quyền riêng tư › "Xóa toàn bộ dữ liệu" → "Xóa". Expected: Lịch sử và Từ điển trống; `data.db` không còn trong thư mục dữ liệu; cài đặt giữ nguyên.
- Thoát app, mở bằng `AI_TRANSLATOR_DEV_FREE=1` (agent sửa `scripts/run-dev-app.sh` tạm, hay chạy binary trong gói với biến này). Expected: Lịch sử, Từ điển hiện "là tính năng Pro" kèm nút Nâng cấp; nút "Xuất…" bị khóa, "Sao chép tất cả" vẫn được; "Lưu lịch sử" bị khóa; phiên dịch không dùng thuật ngữ.

- [ ] **Step 7: Bảng debug**

Màn hình Giới thiệu, bấm 5 lần vào dòng phiên bản. Expected: bảng "Chẩn đoán" có các phiên vừa chạy, p50/p90 của từng bước; không có chữ chép lời nào.

- [ ] **Step 8: Ghi kết quả và commit**

Agent ghi `bench/phase0/results/gd1_03_mac.md`: ngày, máy, macOS, từng step với kết quả (đạt hay không, ghi chú), và mọi lỗi tìm thấy (mỗi lỗi một dòng, kèm cách tái hiện). Lỗi chặn bàn giao thì sửa theo superpowers:systematic-debugging rồi thử lại step đó.

```bash
git add bench/phase0/results/gd1_03_mac.md
git commit -m "test(app): thử tay thanh phụ đề, bản chép lời, lịch sử, từ điển trên Mac (kế hoạch 03)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 9: Đợt Windows (cần máy Windows và người)

Làm trong đợt Windows của mục 3 của kế hoạch 00, sau 01 Task 25 và 02c Task 9. Dòng 17, 25, 68, 155, 301 (phần Windows); mục 2.3 của kế hoạch 00 ("Cần Windows: DPI 150%, nhiều màn hình, build SQLCipher trên Windows").

**Cần người thao tác:** cả task.

**Files:**
- Create: `bench/phase0/results/gd1_03_windows.md`

- [ ] **Step 1: Build SQLCipher với OpenSSL trên Windows**

Cài Strawberry Perl nếu máy chưa có (`perl -v` phải chạy được trong PowerShell; Perl của Git for Windows không dùng được cho OpenSSL). `nasm` không bắt buộc.
Run (PowerShell, gốc repo):
```powershell
cargo test -p meeting-translator --lib db:: -- --test-threads=1
cargo test -p meeting-translator
```
Expected: lần đầu build `openssl-src` mất vài phút; `db::` có 10 test qua (`the_sqlite3_tool_cannot_read_the_file` in "không có sqlite3, bỏ qua" nếu máy không có `sqlite3`); cả crate xanh. Ghi thời gian build OpenSSL và có hay không `nasm`.

- [ ] **Step 2: Không có DLL OpenSSL nào**

Run (Developer PowerShell):
```powershell
pnpm tauri build --debug --no-bundle
dumpbin /dependents target\debug\meeting-translator.exe
```
Expected: không có `libcrypto*.dll` hay `libssl*.dll` trong danh sách (OpenSSL tĩnh, QĐ1). Ghi danh sách DLL.

- [ ] **Step 3: Kho khóa và DB trên Windows**

Người chạy app, bật "Lưu lịch sử", chạy một phiên rồi Dừng.
Expected: `%LOCALAPPDATA%\com.aitranslator.desktop\data.db` có; `cmdkey /list` có mục `db-key` của `com.aitranslator.desktop` với "Local machine persistence"; Lịch sử có phiên vừa rồi. "Xóa toàn bộ dữ liệu": file và mục khóa đều mất.

- [ ] **Step 4: Thanh phụ đề trên Windows**

- Kéo cạnh và góc khi chưa khóa: đổi kích thước được, con trỏ đổi theo hướng; thanh không lấy focus của app họp, không hiện trên taskbar. Khóa: vùng kéo cạnh không còn, click xuyên qua.
- Màn hình DPI 150%: chữ sắc, vị trí và kích thước nhớ đúng sau khi thoát và mở lại.
- Hai màn hình có DPI khác nhau (100% và 150%): kéo thanh qua lại, thoát rồi mở lại: thanh về đúng màn hình, đúng kích thước.
- Teams hoặc Zoom toàn màn hình: thanh nổi trên cùng, chỉ báo hiện đúng.

- [ ] **Step 5: Nghe thử, hộp thoại file, CSV với Excel**

- Bước "Nghe thử": câu mẫu phát qua loa có phụ đề (WebView2 phát qua thiết bị mặc định, loopback thu được).
- Xuất TXT, SRT, Markdown qua hộp thoại lưu của Windows; nhập CSV lưu từ Excel bằng "CSV UTF-8": tiếng Việt đúng. Lưu từ Excel bằng "CSV (Comma delimited)" (bảng mã Windows-1258): app báo "Không đọc được file CSV này".

- [ ] **Step 6: Ghi kết quả và commit**

```bash
git add bench/phase0/results/gd1_03_windows.md
git commit -m "test(app): đợt Windows của kế hoạch 03: SQLCipher với OpenSSL tĩnh, thanh phụ đề, hộp thoại file" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 10: Cập nhật kế hoạch 00

Làm theo Task 2 của kế hoạch 00 (`docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`), cho cả 03a và 03b:
- Step 1–2: liệt kê 45 dòng có `03`, đổi trạng thái theo bảng "Dòng của bảng đối chiếu" của 03a và kết quả thật (SHA commit của task). Dòng còn phần của 04, 06, 08, còn chờ Task 8 (người) hay Task 9 (Windows), hay chờ T1 thì để `đang làm` hoặc `chờ` kèm lý do.
- Step 3: thêm dòng cho việc phát sinh nếu chủ dự án chưa quyết các điểm ở "Điểm cần chủ dự án quyết" của 03a (độ bám thuật ngữ của gói Chuẩn ở điểm 1; thuật ngữ gắn ngôn ngữ ở điểm 2).
- Step 4:
  - mục 2: tên hai file 03a, 03b thay cho tên đang ghi ở bảng mục 2 và mục 2.3; trạng thái của 03;
  - mục 2.6 (06), "Nhận từ 03": điểm kiểm tra Pro là `src-tauri/src/pro.rs` (`ProGate`, `install_gate`, `refresh`, `require`, `is_pro`); thay `DevGate` bằng trạng thái bản quyền và gọi `refresh` khi bản quyền đổi; `AppStatus.pro` là trạng thái giao diện dùng; danh sách tính năng Pro ở QĐ8 của 03a; hai nút xóa dữ liệu chỉ xóa `data.db` và mục `db-key` (Q14);
  - mục 2.4 (04), "Nhận từ 03": nút "Xóa model và dữ liệu" gọi `data::clear_all_data` rồi xóa model, đặt trong `PrivacySettings.tsx`; ghi chú N1, N2 của review cuối 02 thuộc 04; danh sách file giao nhau ở 03a;
  - mục 2.7 (07), "Nhận từ 03": ghi công SQLCipher (BSD), OpenSSL 3.6.3 (Apache-2.0, chỉ Windows) và câu mẫu FLEURS (CC BY 4.0) vào `THIRD_PARTY_NOTICES`; CI Windows cần Perl để build `openssl-src`; `public/listen-test-en.wav` nằm trong `dist/`;
  - mục 6.2: `scripts/check-windows.sh` nay đặt thêm biến cho `libsqlite3-sys` và `openssl-sys`.
- Step 5–6: kiểm định dạng bảng, rồi commit với thông điệp `docs(plan): cập nhật tổng quan Giai đoạn 1 sau kế hoạch 03`.
