import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { fakeIpc } from "../lib/fakeIpc";
import type { CaptureMode, ListenStatus, OverlayView, SpeakerVoice, Subtitle } from "../lib/ipc";
import { LABEL_WAIT_MS } from "../lib/listenSource";
import { NO_VOICES, type VoiceMap } from "../lib/speakers";
import { type ListenDeps, createListenStore } from "./listen";

// "Nghe dịch" (spec 2026-11-02-nghe-dich-truc-tiep §6): hàng đợi đọc bản dịch của tiếng máy, không đọc lời micro.

type OverlayLike = { lines: Subtitle[]; voices: VoiceMap; view: OverlayView | null };
type TtsLike = {
  speaking: number | null;
  error: { code: string; field: string | null } | null;
  speak(id: number, text: string, lang: "vi" | "en"): Promise<void>;
  stop(): Promise<void>;
};

const line = (id: number, over: Partial<Subtitle> = {}): Subtitle => ({
  id,
  start_ms: 0,
  end_ms: 1,
  src_lang: "en",
  src_text: "hello",
  tgt_text: `câu ${id}`,
  status: "done",
  provisional: false,
  replaces: [],
  speaker: null,
  ...over,
});

const voice = (id: number, room: boolean): SpeakerVoice => ({
  id,
  label: `Người ${id}`,
  color: 0,
  source: "voice",
  room,
  mergedInto: null,
});

function setup(
  opts: {
    mode?: CaptureMode;
    target?: string;
    supported?: boolean;
    stored?: string | null;
    storageThrows?: boolean;
    listenSet?: (a: { enabled: boolean; level: number }) => ListenStatus;
  } = {},
) {
  const f = fakeIpc({
    overlay_listen_status: () => ({ supported: opts.supported ?? true, active: false }),
    overlay_listen_set: (a) => opts.listenSet?.(a) ?? { supported: opts.supported ?? true, active: a.enabled },
    overlay_tts_warmup: () => null,
  });
  const overlay = createStore<OverlayLike>(() => ({
    lines: [],
    voices: NO_VOICES,
    view: { captureMode: opts.mode ?? "playback", targetLanguage: opts.target ?? "vi" } as unknown as OverlayView,
  }));
  const spoken: { id: number; text: string }[] = [];
  let stops = 0;
  const tts = createStore<TtsLike>((set) => ({
    speaking: null,
    error: null,
    speak: async (id, text) => {
      spoken.push({ id, text });
      set({ speaking: id, error: null });
    },
    stop: async () => {
      stops += 1;
      set({ speaking: null });
    },
  }));
  let clock = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const storage = new Map<string, string>();
  if (opts.stored != null) storage.set("listen.level", opts.stored);
  const deps: ListenDeps = {
    ipc: f.ipc,
    tts,
    overlay,
    now: () => clock,
    setTimer: (fn, ms) => {
      const t = { at: clock + ms, fn };
      timers.push(t);
      return () => {
        t.fn = () => {};
      };
    },
    storage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => {
        if (opts.storageThrows) throw new Error("đầy");
        storage.set(k, v);
      },
    },
  };
  const store = createListenStore(deps);
  const advance = (ms: number) => {
    clock += ms;
    for (const t of timers.splice(0).sort((a, b) => a.at - b.at)) {
      if (t.at <= clock) t.fn();
      else timers.push(t);
    }
  };
  const finishReading = () => tts.setState({ speaking: null });
  const setLines = (lines: Subtitle[]) => overlay.setState({ lines });
  return { store, f, overlay, tts, spoken, finishReading, setLines, advance, storage, stops: () => stops, deps };
}

const on = async (s: ReturnType<typeof setup>) => {
  await s.store.getState().init();
  await s.store.getState().toggle();
};

describe("bật tắt", () => {
  it("bật gọi overlay_listen_set với mức đã lưu, và chỉ đọc câu mới (không đọc câu cũ)", async () => {
    const s = setup({ stored: "30" });
    s.setLines([line(1)]);
    await on(s);
    expect(s.f.calls.find((c) => c.cmd === "overlay_listen_set")?.args).toEqual({ enabled: true, level: 30 });
    expect(s.store.getState().active).toBe(true);
    expect(s.spoken).toEqual([]);
    s.setLines([line(1), line(2)]);
    expect(s.spoken.map((x) => x.id)).toEqual([2]);
  });

  it("tắt dừng giọng, xóa hàng đợi, gọi overlay_listen_set(false)", async () => {
    const s = setup();
    await on(s);
    s.setLines([line(1), line(2), line(3)]);
    expect(s.spoken.map((x) => x.id)).toEqual([1]);
    await s.store.getState().toggle();
    expect(s.store.getState().active).toBe(false);
    expect(s.stops()).toBeGreaterThan(0);
    expect(s.store.getState().pending).toBe(0);
    expect(s.f.calls.at(-1)).toEqual({ cmd: "overlay_listen_set", args: { enabled: false, level: 10 } });
    s.finishReading();
    expect(s.spoken.map((x) => x.id)).toEqual([1]);
  });

  it("chưa hỏi lõi thì chưa hiện nút", async () => {
    const s = setup();
    expect(s.store.getState().supported).toBe(false);
    await s.store.getState().init();
    expect(s.store.getState().supported).toBe(true);
  });

  it("nền tảng không hỗ trợ thì không bật được", async () => {
    const s = setup({ supported: false });
    await on(s);
    expect(s.store.getState().supported).toBe(false);
    expect(s.store.getState().active).toBe(false);
  });

  it("lệnh bật lỗi thì vẫn tắt và báo listenFailed", async () => {
    const s = setup({
      listenSet: () => {
        throw { code: "x", field: null, message: "" };
      },
    });
    await on(s);
    expect(s.store.getState().active).toBe(false);
    expect(s.store.getState().error).toBe("listenFailed");
  });
});

describe("đọc lần lượt", () => {
  it("mỗi lúc một câu, đúng thứ tự, câu sau chỉ sau khi câu trước đọc xong", async () => {
    const s = setup();
    await on(s);
    s.setLines([line(1), line(2), line(3)]);
    expect(s.spoken.map((x) => x.id)).toEqual([1]);
    expect(s.store.getState().pending).toBe(2);
    s.finishReading();
    expect(s.spoken.map((x) => x.id)).toEqual([1, 2]);
    s.finishReading();
    expect(s.spoken.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(s.store.getState().pending).toBe(0);
  });

  it("câu tạm, câu đang dịch, câu lỗi không được đọc; chốt xong mới đọc, đúng một lần", async () => {
    const s = setup();
    await on(s);
    s.setLines([line(1, { status: "translating", tgt_text: "đang…" })]);
    s.setLines([line(1, { provisional: true, status: "done" })]);
    expect(s.spoken).toEqual([]);
    s.setLines([line(1)]);
    s.finishReading();
    s.setLines([line(1, { tgt_text: "bản sửa" })]);
    expect(s.spoken.map((x) => x.id)).toEqual([1]);
  });

  it("ngôn ngữ đích không có giọng đọc thì im", async () => {
    const s = setup({ target: "ko" });
    await on(s);
    s.setLines([line(1)]);
    expect(s.spoken).toEqual([]);
  });

  it("Bỏ qua: xóa phần dồn, đọc tiếp từ câu mới nhất", async () => {
    const s = setup();
    await on(s);
    s.setLines([line(1), line(2), line(3), line(4)]);
    expect(s.spoken.map((x) => x.id)).toEqual([1]);
    s.store.getState().skip();
    expect(s.store.getState().pending).toBe(1);
    s.finishReading();
    expect(s.spoken.map((x) => x.id)).toEqual([1, 4]);
  });

  it("lỗi đọc một câu không chặn hàng đợi, và lỗi được báo", async () => {
    const s = setup();
    await on(s);
    s.setLines([line(1), line(2)]);
    s.tts.setState({ speaking: null, error: { code: "ttsFailed", field: null } });
    expect(s.spoken.map((x) => x.id)).toEqual([1, 2]);
    expect(s.store.getState().error).toBe("ttsFailed");
  });
});

describe("không đọc lời của người dùng (micro)", () => {
  it("chế độ both: giọng 'trong phòng' không đọc, giọng khách đọc", async () => {
    const s = setup({ mode: "both" });
    await on(s);
    s.overlay.setState({ voices: new Map([[1, voice(1, true)], [2, voice(2, false)]]) });
    s.setLines([line(1, { speaker: 1 }), line(2, { speaker: 2 })]);
    expect(s.spoken.map((x) => x.id)).toEqual([2]);
  });

  it("chưa có nhãn giọng: chờ, hết hạn thì đọc; nhãn tới trong lúc chờ là giọng micro thì bỏ", async () => {
    const s = setup({ mode: "both" });
    await on(s);
    s.setLines([line(1), line(2)]);
    expect(s.spoken).toEqual([]);
    s.advance(LABEL_WAIT_MS - 100);
    expect(s.spoken).toEqual([]);
    s.overlay.setState({ voices: new Map([[5, voice(5, true)]]), lines: [line(1, { speaker: 5 }), line(2)] });
    s.advance(0);
    expect(s.spoken.map((x) => x.id)).toEqual([]);
    s.advance(200);
    expect(s.spoken.map((x) => x.id)).toEqual([2]);
  });

  it("chế độ chỉ micro: không đọc gì", async () => {
    const s = setup({ mode: "mic" });
    await on(s);
    s.setLines([line(1)]);
    expect(s.spoken).toEqual([]);
  });

  it("both mà phiên không có nhãn giọng nào: vẫn đọc, và báo 'chưa phân biệt được lời của bạn'", async () => {
    const s = setup({ mode: "both" });
    await on(s);
    for (let id = 1; id <= 3; id++) {
      s.setLines([...s.overlay.getState().lines, line(id)]);
      s.advance(LABEL_WAIT_MS);
      s.finishReading();
    }
    expect(s.spoken.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(s.store.getState().unresolved).toBe(true);
  });
});

describe("sự kiện lõi, mức, lưu trữ", () => {
  it("listen://state báo lỗi: tắt, dừng giọng, xóa hàng đợi, giữ mã lỗi", async () => {
    const s = setup();
    await on(s);
    s.setLines([line(1), line(2)]);
    s.f.emit("listen://state", { active: false, error: "listenFailed" });
    await Promise.resolve();
    expect(s.store.getState().active).toBe(false);
    expect(s.store.getState().error).toBe("listenFailed");
    expect(s.store.getState().pending).toBe(0);
    expect(s.stops()).toBeGreaterThan(0);
  });

  it("đổi mức khi đang bật gọi lại overlay_listen_set; mức được kẹp 0–100 và lưu", async () => {
    const s = setup();
    await on(s);
    await s.store.getState().setLevel(250);
    expect(s.store.getState().level).toBe(100);
    s.advance(200);
    expect(s.f.calls.at(-1)).toEqual({ cmd: "overlay_listen_set", args: { enabled: true, level: 100 } });
    expect(s.storage.get("listen.level")).toBe("100");
    // Dưới mức thấp nhất thì kẹp lên (nhận dạng cần còn tiếng để dịch).
    await s.store.getState().setLevel(-5);
    expect(s.store.getState().level).toBe(10);
  });

  it("lưu trữ ném lỗi hay có giá trị rác thì không làm hỏng store", async () => {
    const throwing = setup({ storageThrows: true });
    await throwing.store.getState().init();
    await expect(throwing.store.getState().setLevel(40)).resolves.toBeUndefined();
    expect(throwing.store.getState().level).toBe(40);
    const junk = setup({ stored: "abc" });
    await junk.store.getState().init();
    expect(junk.store.getState().level).toBe(10);
  });

  it("câu quá nhiều (1000 câu) không làm kẹt hay sập", async () => {
    const s = setup();
    await on(s);
    s.setLines(Array.from({ length: 1000 }, (_, i) => line(i + 1)));
    expect(s.spoken).toHaveLength(1);
    expect(s.store.getState().pending).toBe(999);
    s.store.getState().skip();
    expect(s.store.getState().pending).toBe(1);
  });
});

describe("rà soát cuối", () => {
  it("tắt khi ta không đang đọc thì không hủy lượt đọc của cửa sổ chính (giọng đọc dùng chung)", async () => {
    const s = setup();
    await on(s);
    await s.store.getState().toggle();
    expect(s.stops()).toBe(0);
  });

  it("kéo thanh mức liên tục chỉ gửi giá trị cuối một lần", async () => {
    const s = setup();
    await on(s);
    const before = s.f.calls.filter((c) => c.cmd === "overlay_listen_set").length;
    for (const v of [20, 30, 40, 55, 60]) await s.store.getState().setLevel(v);
    s.advance(100);
    expect(s.f.calls.filter((c) => c.cmd === "overlay_listen_set").length).toBe(before);
    s.advance(100);
    const sets = s.f.calls.filter((c) => c.cmd === "overlay_listen_set");
    expect(sets.length).toBe(before + 1);
    expect(sets.at(-1)?.args).toEqual({ enabled: true, level: 60 });
  });

  it("đọc lỗi hai lần liên tiếp thì tắt hẳn và trả tiếng họp (không để họp bị hạ mà không đọc gì)", async () => {
    const s = setup();
    await on(s);
    s.setLines([line(1), line(2), line(3)]);
    s.tts.setState({ speaking: null, error: { code: "ttsFailed", field: null } });
    expect(s.store.getState().active).toBe(true);
    s.tts.setState({ speaking: null, error: { code: "ttsFailed", field: null } });
    await Promise.resolve();
    await Promise.resolve();
    expect(s.store.getState().active).toBe(false);
    expect(s.store.getState().error).toBe("ttsFailed");
    expect(s.f.calls.at(-1)).toEqual({ cmd: "overlay_listen_set", args: { enabled: false, level: 10 } });
  });

  it("một lần đọc lỗi rồi đọc được thì không tính dồn", async () => {
    const s = setup();
    await on(s);
    s.setLines([line(1), line(2), line(3)]);
    s.tts.setState({ speaking: null, error: { code: "ttsFailed", field: null } });
    s.finishReading();
    s.tts.setState({ speaking: null, error: { code: "ttsFailed", field: null } });
    expect(s.store.getState().active).toBe(true);
  });

  it("overlay nạp lại mà lõi còn đang hạ thì tắt cho khớp", async () => {
    const s = setup();
    s.f.calls.length = 0;
    const f = fakeIpc({
      overlay_listen_status: () => ({ supported: true, active: true }),
      overlay_listen_set: (a) => ({ supported: true, active: a.enabled }),
      overlay_tts_warmup: () => null,
    });
    const store = createListenStore({ ...s.deps, ipc: f.ipc });
    await store.getState().init();
    expect(f.calls.some((c) => c.cmd === "overlay_listen_set" && (c.args as { enabled: boolean }).enabled === false)).toBe(true);
    expect(store.getState().active).toBe(false);
  });
});


describe("nạp sẵn giọng", () => {
  const warmups = (s: ReturnType<typeof setup>) => s.f.calls.filter((c) => c.cmd === "overlay_tts_warmup").length;
  const session = (s: ReturnType<typeof setup>, state: string) =>
    s.overlay.setState({ status: { session: state } } as unknown as Partial<OverlayLike>);

  it("đã từng bật thì phiên vừa chạy là nạp giọng nền ngay, chưa từng thì không", async () => {
    const used = setup();
    used.storage.set("listen.used", "1");
    await used.store.getState().init();
    session(used, "starting");
    expect(warmups(used)).toBe(0);
    session(used, "running");
    expect(warmups(used)).toBe(1);
    session(used, "running");
    expect(warmups(used)).toBe(1);

    const fresh = setup();
    await fresh.store.getState().init();
    session(fresh, "running");
    expect(warmups(fresh)).toBe(0);
  });

  it("bật lần đầu nhớ là đã dùng; đang bật thì cứ vài phút nạp lại để worker không bị tắt vì rảnh", async () => {
    const s = setup();
    await on(s);
    expect(s.storage.get("listen.used")).toBe("1");
    const base = warmups(s);
    s.advance(150_000);
    expect(warmups(s)).toBe(base + 1);
    await s.store.getState().toggle();
    const afterOff = warmups(s);
    s.advance(150_000);
    expect(warmups(s)).toBe(afterOff);
  });

  it("không lưu được thì vẫn chạy bình thường", async () => {
    const s = setup({ storageThrows: true });
    await on(s);
    expect(s.store.getState().active).toBe(true);
  });
});

describe("khởi động sẵn bộ phát", () => {
  it("bấm bật thì gọi prepare ngay (trước khi chờ lõi), bấm tắt thì không", async () => {
    const s = setup();
    let prepared = 0;
    (s.tts.setState as unknown as (p: object) => void)({ prepare: () => (prepared += 1) });
    await s.store.getState().init();
    const pending = s.store.getState().toggle();
    expect(prepared).toBe(1);
    await pending;
    await s.store.getState().toggle();
    expect(prepared).toBe(1);
  });
});
