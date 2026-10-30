import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { AppStatus, SpeakerRoster, SpeakerVoice, Subtitle, Transcript } from "../lib/ipc";
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
  speaker: null,
});

const status = (session: AppStatus["session"], rev: number): AppStatus => ({
  session,
  overlayVisible: true,
  hotkeyFailures: [],
  loading: null,
  sessionError: null,
  cpuFallback: false,
  suggestLite: false,
  indicators: { lagging: false, noAudio: false, translationUnavailable: false, streamingUnavailable: false },
  streamingTooSlow: false,
  permissionSuspected: false,
  waitingForApp: false,
  waitingForDevice: false,
  micIssue: null,
  pro: true,
  quotaWarning: false,
  quotaResetAt: null,
  updateReady: null,
  updateReprompts: false,
  updateCheck: "idle",
  rev,
});

const transcript = (lines: Subtitle[], session = 1): Transcript => ({
  session,
  startedAt: 1_000,
  endedAt: null,
  targetLang: "vi",
  lines,
  speakers: [],
  speakersRev: 0,
});

const voice = (id: number, patch: Partial<SpeakerVoice> = {}): SpeakerVoice => ({
  id,
  label: `Người ${id}`,
  color: id - 1,
  source: "voice",
  room: false,
  mergedInto: null,
  ...patch,
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
    // Phiên bắt đầu ở 9 000 ms là giờ mùa hè (+7 giờ); lúc khác là +1 giờ.
    offsetMinutes: (at) => (at === 9_000 ? 420 : 60),
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

  // Spec 2026-10-10 QĐ5: dòng đang nói chỉ có trên thanh phụ đề; bản chép lời của cửa sổ chính không nghe hai sự kiện đó.
  it("không nghe dòng đang nói", async () => {
    const { fake, store } = setup(transcript([sub(1, "một")]));
    await store.getState().init();
    expect(fake.listenerCount("subtitle://live")).toBe(0);
    expect(fake.listenerCount("subtitle://live-end")).toBe(0);
    fake.emit("subtitle://live", {
      id: 2,
      extends: null,
      src_lang: "en",
      src_stable: "Hel",
      src_tail: "lo",
      tgt_stable: "Xin",
      tgt_tail: " chào",
      tgt_src_units: 1,
      speaker: null,
    });
    expect(store.getState().transcript?.lines.map((l) => l.id)).toEqual([1]);
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

  it("sao chép qua phía Rust với độ lệch múi giờ lúc bắt đầu phiên, rồi báo đã sao chép", async () => {
    const { store, copied } = setup(transcript([]));
    await store.getState().init();
    await store.getState().copy({ kind: "current" }, 9_000);
    expect(copied).toEqual(["TXT 420"]);
    expect(store.getState().notice).toEqual({ kind: "copied" });
  });

  it("xuất file: báo đường dẫn; bấm Hủy thì không báo gì; lỗi Pro hiện mã lỗi", async () => {
    const { fake, store } = setup(transcript([]));
    await store.getState().init();
    await store.getState().exportTo({ kind: "current" }, "markdown", "translation", 9_000);
    expect(store.getState().notice).toEqual({ kind: "exported", path: "/tmp/x.markdown" });
    expect(fake.calls.at(-1)?.args).toEqual({
      source: { kind: "current" },
      format: "markdown",
      srtText: "translation",
      utcOffsetMinutes: 420,
      srtSpeakers: false,
    });
    await store.getState().exportTo({ kind: "current" }, "srt", "source", 9_000);
    expect(store.getState().notice).toBeNull();
    const refusing = fakeIpc({
      get_transcript: () => transcript([]),
      export_transcript: () => {
        throw { code: "proRequired", field: null, message: "…" };
      },
    });
    const locked = createTranscriptStore({ ipc: refusing.ipc, writeClipboard: async () => {} });
    await locked.getState().init();
    await locked.getState().exportTo({ kind: "current" }, "txt", "translation", 0);
    expect(locked.getState().error).toEqual({ code: "proRequired", field: null });
    locked.getState().dismiss();
    expect(locked.getState().error).toBeNull();
  });

  it("reset: bỏ bản chép lời đang hiện; bản đọc tới sau không bị chặn bởi dòng đã gộp của phiên cũ", async () => {
    const { fake, store } = setup(transcript([sub(1, "một")]));
    await store.getState().init();
    fake.emit("subtitle://upsert", { ...sub(2, "hai"), replaces: [3] });
    store.getState().reset();
    expect(store.getState().transcript?.lines).toEqual([]);
    fake.emit("subtitle://upsert", sub(3, "ba"));
    expect(store.getState().transcript?.lines.map((l) => l.id)).toEqual([3]);
  });

  // Spec 2026-10-26-phan-biet-nguoi-noi §8.2, §9.
  it("theo nhãn tới muộn và bảng người nói; phiên mới thì bỏ", async () => {
    const { fake, store } = setup(transcript([sub(1, "một"), sub(2, "hai")]));
    await store.getState().init();
    fake.emit("subtitle://speaker", { id: 2, speaker: 1 });
    expect(store.getState().transcript?.lines.map((l) => l.speaker)).toEqual([null, 1]);
    fake.emit("speaker://roster", { voices: [voice(1)], participants: ["Hoa Phạm"], askAccess: false, rev: 1 });
    expect(store.getState().transcript?.speakers).toEqual([voice(1)]);
    expect(store.getState().participants).toEqual(["Hoa Phạm"]);
    fake.emit("app://status", status("starting", 2));
    expect(store.getState().transcript?.speakers).toEqual([]);
    expect(store.getState().participants).toEqual([]);
  });

  it("đổi tên, gộp qua phía Rust rồi dùng bảng trả về; lỗi thì hiện mã lỗi", async () => {
    const renamed: SpeakerRoster = {
      voices: [voice(1, { label: "Lan", source: "user" })],
      participants: [],
      askAccess: false,
      rev: 1,
    };
    const merged: SpeakerRoster = {
      voices: [voice(1), voice(2, { mergedInto: 1, label: "Người 1", color: 0 })],
      participants: [],
      askAccess: false,
      rev: 2,
    };
    const fake = fakeIpc({
      get_transcript: () => transcript([]),
      rename_speaker: ({ name }) => {
        if (name === "x") throw { code: "speakerNotFound", field: null, message: "…" };
        return renamed;
      },
      merge_speakers: () => merged,
    });
    const store = createTranscriptStore({ ipc: fake.ipc, writeClipboard: async () => {} });
    await store.getState().init();
    expect(await store.getState().renameSpeaker(1, "Lan")).toBe(true);
    expect(fake.calls.at(-1)).toEqual({ cmd: "rename_speaker", args: { id: 1, name: "Lan" } });
    expect(store.getState().transcript?.speakers[0]?.label).toBe("Lan");
    expect(await store.getState().mergeSpeakers(2, 1)).toBe(true);
    expect(fake.calls.at(-1)).toEqual({ cmd: "merge_speakers", args: { from: 2, into: 1 } });
    expect(store.getState().transcript?.speakers[1]?.mergedInto).toBe(1);
    expect(await store.getState().renameSpeaker(1, "x")).toBe(false);
    expect(store.getState().error).toEqual({ code: "speakerNotFound", field: null });
  });

  it("xuất SRT có tên người nói khi chọn", async () => {
    const { fake, store } = setup(transcript([]));
    await store.getState().init();
    await store.getState().exportTo({ kind: "current" }, "srt", "translation", 9_000, true);
    expect(fake.calls.at(-1)?.args).toMatchObject({ format: "srt", srtSpeakers: true });
  });

  // QĐ 25 (rà soát A-N2, B-N11): bảng cũ hơn tới muộn thì bỏ; bản chụp `get_transcript` cũ hơn không đè bảng mới hơn.
  it("bảng người nói hay bản chụp cũ hơn tới muộn thì không đè bảng mới", async () => {
    const { fake, store, setSnapshot } = setup(transcript([sub(1, "một")]));
    await store.getState().init();
    fake.emit("speaker://roster", { voices: [voice(1, { label: "Lan" })], participants: [], askAccess: false, rev: 7 });
    fake.emit("speaker://roster", { voices: [voice(1)], participants: [], askAccess: false, rev: 6 });
    expect(store.getState().transcript?.speakers[0]?.label).toBe("Lan");
    setSnapshot({ ...transcript([sub(1, "một")]), speakers: [voice(1)], speakersRev: 5 });
    fake.emit("app://status", status("running", 3));
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().transcript?.speakers[0]?.label).toBe("Lan");
    setSnapshot({ ...transcript([sub(1, "một")]), speakers: [voice(1, { label: "Hoa" })], speakersRev: 8 });
    fake.emit("app://status", status("idle", 4));
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().transcript?.speakers[0]?.label).toBe("Hoa");
  });
});
