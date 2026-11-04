import type { Channel } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { TtsControl, TtsStatus } from "../lib/ipc";
import { TTS_POLL_MS, createTtsStore } from "./tts";

type Msg = ArrayBuffer | TtsControl;
type FakeChannel = { onmessage: (m: Msg) => void };

const AVAILABLE: TtsStatus = { available: true, running: false, reason: null, progress: null };

function setup(handlers: Parameters<typeof fakeIpc>[0] = {}) {
  const channels: FakeChannel[] = [];
  const idle: (() => void)[] = [];
  const log: string[] = [];
  const f = fakeIpc({
    tts_status: () => AVAILABLE,
    tts_speak: (args) => {
      channels.push(args.onEvent as unknown as FakeChannel);
      return channels.length;
    },
    tts_stop: () => null,
    ...handlers,
  });
  const store = createTtsStore({
    ipc: f.ipc,
    player: {
      begin: () => void log.push("begin"),
      push: (b) => log.push(`push:${b.byteLength}`),
      whenIdle: (cb) => void idle.push(cb),
      stop: () => void log.push("stop"),
    },
    createChannel: () => ({ onmessage: () => {} }) as unknown as Channel<Msg>,
  });
  return { store, f, channels, idle, log };
}

const bytes = (n: number) => new ArrayBuffer(n);

describe("trạng thái", () => {
  it("hỏi trạng thái lúc init", async () => {
    const { store } = setup();
    expect(store.getState().status).toBeNull();
    await store.getState().init();
    expect(store.getState().status).toEqual(AVAILABLE);
  });

  it("lệnh lỗi thì coi như không có giọng đọc", async () => {
    const { store } = setup({
      tts_status: () => {
        throw { code: "x", field: null, message: "" };
      },
    });
    await store.getState().init();
    expect(store.getState().status?.available).toBe(false);
  });
});

describe("model đổi (tải xong gói ASR hay gói giọng đọc)", () => {
  const MISSING: TtsStatus = { available: false, running: false, reason: "modelMissing", progress: null };

  it("nhận tts://changed thì hỏi lại trạng thái: nút sáng lên mà không phải mở lại app", async () => {
    let ready = false;
    const { store, f } = setup({ tts_status: () => (ready ? AVAILABLE : MISSING) });
    await store.getState().init();
    expect(store.getState().status).toEqual(MISSING);
    ready = true;
    f.emit("tts://changed", null);
    await vi.waitFor(() => expect(store.getState().status).toEqual(AVAILABLE));
  });

  it("init gọi hai lần vẫn chỉ nghe sự kiện một lần", async () => {
    const { store, f } = setup();
    await store.getState().init();
    await store.getState().init();
    expect(f.listenerCount("tts://changed")).toBe(1);
  });

  it("không nghe được sự kiện thì init vẫn xong và trạng thái vẫn có", async () => {
    const { store, f } = setup();
    f.ipc.listen = async () => {
      throw new Error("không nghe được");
    };
    await expect(store.getState().init()).resolves.toBeUndefined();
    expect(store.getState().status).toEqual(AVAILABLE);
  });

  it("hỏi lại mà lệnh lỗi thì coi như chưa có giọng đọc, không ném lỗi ra ngoài", async () => {
    let fail = false;
    const { store, f } = setup({
      tts_status: () => {
        if (fail) throw { code: "x", field: null, message: "" };
        return AVAILABLE;
      },
    });
    await store.getState().init();
    fail = true;
    f.emit("tts://changed", null);
    await vi.waitFor(() => expect(store.getState().status?.available).toBe(false));
  });
});

describe("tải gói giọng đọc về nền", () => {
  afterEach(() => vi.useRealTimers());

  const downloading = (progress: number): TtsStatus => ({
    available: false,
    running: false,
    reason: "downloading",
    progress,
  });

  it("đang tải thì hỏi lại định kỳ, xong thì nút sáng lên và dừng hỏi", async () => {
    vi.useFakeTimers();
    const answers = [downloading(10), downloading(60), AVAILABLE];
    let calls = 0;
    const { store } = setup({ tts_status: () => answers[Math.min(calls++, answers.length - 1)] });
    await store.getState().init();
    expect(store.getState().status?.progress).toBe(10);
    await vi.advanceTimersByTimeAsync(TTS_POLL_MS);
    expect(store.getState().status?.progress).toBe(60);
    await vi.advanceTimersByTimeAsync(TTS_POLL_MS);
    expect(store.getState().status?.available).toBe(true);
    await vi.advanceTimersByTimeAsync(TTS_POLL_MS * 5);
    expect(calls).toBe(3);
  });

  it("chờ tải (waiting) cũng hỏi lại", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const { store } = setup({
      tts_status: () => (++calls < 2 ? { available: false, running: false, reason: "waiting", progress: null } : AVAILABLE),
    });
    await store.getState().init();
    await vi.advanceTimersByTimeAsync(TTS_POLL_MS);
    expect(store.getState().status?.available).toBe(true);
  });

  it("thiếu file mà manifest không có gói thì không hỏi lại", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const { store } = setup({
      tts_status: () => {
        calls += 1;
        return { available: false, running: false, reason: "modelMissing", progress: null };
      },
    });
    await store.getState().init();
    await vi.advanceTimersByTimeAsync(TTS_POLL_MS * 5);
    expect(calls).toBe(1);
  });

  it("gọi refreshStatus liên tiếp không đẻ thêm bộ hẹn giờ", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const { store } = setup({
      tts_status: () => {
        calls += 1;
        return downloading(5);
      },
    });
    await store.getState().refreshStatus();
    await store.getState().refreshStatus();
    await store.getState().refreshStatus();
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(TTS_POLL_MS);
    expect(calls).toBe(4);
  });
});

describe("đọc một câu", () => {
  it("gọi tts_speak với ngôn ngữ, chữ và kênh; âm thanh đi vào bộ phát", async () => {
    const { store, f, channels, log } = setup();
    await store.getState().speak(7, "Xin chào", "vi");
    expect(store.getState().speaking).toBe(7);
    expect(store.getState().loading).toBe(true);
    expect(f.calls.find((c) => c.cmd === "tts_speak")?.args).toMatchObject({ lang: "vi", text: "Xin chào" });
    channels[0]?.onmessage(bytes(96));
    expect(log).toContain("begin");
    expect(log).toContain("push:96");
    expect(store.getState().loading).toBe(false);
    expect(store.getState().speaking).toBe(7);
  });

  it("đọc xong (done) thì chờ bộ phát phát hết rồi mới bỏ trạng thái đang đọc", async () => {
    const { store, channels, idle } = setup();
    await store.getState().speak(1, "Hello", "en");
    channels[0]?.onmessage(bytes(10));
    channels[0]?.onmessage({ kind: "done" });
    expect(store.getState().speaking).toBe(1);
    idle[0]?.();
    expect(store.getState().speaking).toBeNull();
  });

  it("bấm lại câu đang đọc thì dừng", async () => {
    const { store, f, log } = setup();
    await store.getState().speak(3, "a", "vi");
    await store.getState().speak(3, "a", "vi");
    expect(store.getState().speaking).toBeNull();
    expect(f.calls.filter((c) => c.cmd === "tts_stop")).toHaveLength(1);
    expect(log.at(-1)).toBe("stop");
  });

  it("bấm câu khác thì câu cũ bị thay; âm thanh tới muộn của câu cũ bị bỏ", async () => {
    const { store, channels, log } = setup();
    await store.getState().speak(1, "một", "vi");
    await store.getState().speak(2, "hai", "vi");
    expect(store.getState().speaking).toBe(2);
    log.length = 0;
    channels[0]?.onmessage(bytes(50)); // của câu 1, tới muộn
    expect(log).toEqual([]);
    channels[1]?.onmessage(bytes(20));
    expect(log).toEqual(["push:20"]);
  });
});

describe("lỗi", () => {
  it("failed (không phải cancelled) hiện lỗi và dừng bộ phát", async () => {
    const { store, channels, log } = setup();
    await store.getState().speak(1, "x", "vi");
    channels[0]?.onmessage({ kind: "failed", code: "workerDied" });
    expect(store.getState().speaking).toBeNull();
    expect(store.getState().error?.code).toBe("ttsFailed");
    expect(log.at(-1)).toBe("stop");
  });

  it("cancelled không phải lỗi; lượt hiện tại bị cửa sổ khác thay thì trả về 'không đọc'", async () => {
    // Giọng đọc dùng chung với cửa sổ khác: nó bấm đọc câu của nó thì lượt của ta nhận `cancelled` mà không do ta bấm.
    const { store, channels, log } = setup();
    await store.getState().speak(1, "x", "vi");
    channels[0]?.onmessage({ kind: "failed", code: "cancelled" });
    expect(store.getState().error).toBeNull();
    expect(store.getState().speaking).toBeNull();
    expect(log.at(-1)).toBe("stop");
  });

  it("cancelled của lượt cũ (do ta bấm câu khác) bị bỏ qua", async () => {
    const { store, channels } = setup();
    await store.getState().speak(1, "x", "vi");
    await store.getState().speak(2, "y", "vi");
    channels[0]?.onmessage({ kind: "failed", code: "cancelled" });
    expect(store.getState().speaking).toBe(2);
    expect(store.getState().error).toBeNull();
  });

  it("lệnh bị từ chối thì hiện mã lỗi của phía Rust và hỏi lại trạng thái", async () => {
    const { store, f } = setup({
      tts_speak: () => {
        throw { code: "ttsUnavailable", field: null, message: "modelMissing" };
      },
    });
    await store.getState().speak(1, "x", "vi");
    expect(store.getState().speaking).toBeNull();
    expect(store.getState().error?.code).toBe("ttsUnavailable");
    expect(f.calls.filter((c) => c.cmd === "tts_status").length).toBeGreaterThan(0);
  });

  it("dismiss xóa lỗi", async () => {
    const { store, channels } = setup();
    await store.getState().speak(1, "x", "vi");
    channels[0]?.onmessage({ kind: "failed", code: "inference" });
    store.getState().dismiss();
    expect(store.getState().error).toBeNull();
  });
});

// Màn hình Giọng đọc (spec 2026-11-04-giong-doc §7): danh sách giọng của gói và Nghe thử.
describe("danh sách giọng", () => {
  const VOICES = { names: ["Hải Đăng", "Mai Anh"], default: "Hải Đăng" };

  it("loadVoices_stores_the_list", async () => {
    const { store, f } = setup({ tts_list_voices: () => VOICES });
    expect(store.getState().voices).toBeNull();
    await store.getState().loadVoices();
    expect(store.getState().voices).toEqual(VOICES);
    expect(f.calls.filter((c) => c.cmd === "tts_list_voices")).toHaveLength(1);
  });

  it("loadVoices_failure_keeps_null_and_does_not_throw", async () => {
    const { store } = setup({
      tts_list_voices: () => {
        throw { code: "ttsUnavailable", field: null, message: "modelMissing" };
      },
    });
    await expect(store.getState().loadVoices()).resolves.toBeUndefined();
    expect(store.getState().voices).toBeNull();
    expect(store.getState().error).toBeNull();
  });

  it("tts_changed_reloads_voices: gói giọng đổi thì hỏi lại danh sách", async () => {
    let names = ["Hải Đăng"];
    const { store, f } = setup({ tts_list_voices: () => ({ names, default: "Hải Đăng" }) });
    await store.getState().init();
    await store.getState().loadVoices();
    names = ["Hải Đăng", "Ngọc Huyền"];
    f.emit("tts://changed", null);
    await vi.waitFor(() => expect(store.getState().voices?.names).toEqual(["Hải Đăng", "Ngọc Huyền"]));
  });

  it("chưa mở màn hình Giọng đọc (chưa gọi loadVoices) thì tts://changed không hỏi danh sách", async () => {
    const { store, f } = setup({ tts_list_voices: () => VOICES });
    await store.getState().init();
    f.emit("tts://changed", null);
    await vi.waitFor(() => expect(f.calls.filter((c) => c.cmd === "tts_status").length).toBe(2));
    expect(f.calls.filter((c) => c.cmd === "tts_list_voices")).toHaveLength(0);
  });
});

describe("nghe thử", () => {
  const previews: FakeChannel[] = [];
  const handlers = {
    tts_preview: (args: { onEvent: unknown }) => {
      previews.push(args.onEvent as FakeChannel);
      return previews.length;
    },
  };
  const OPTS = { text: "Xin chào", voice: "Mai Anh", speed: 1.2, pause: 0.5, volume: 70 };

  it("preview_invokes_tts_preview_with_given_options", async () => {
    previews.length = 0;
    const { store, f, log } = setup(handlers);
    await store.getState().preview("vi", OPTS);
    expect(store.getState().previewing).toBe("vi");
    expect(f.calls.find((c) => c.cmd === "tts_preview")?.args).toMatchObject({
      lang: "vi",
      text: "Xin chào",
      voice: "Mai Anh",
      speed: 1.2,
      pause: 0.5,
      volume: 70,
    });
    previews[0]?.onmessage(bytes(64));
    expect(log).toContain("push:64");
    expect(store.getState().loading).toBe(false);
  });

  it("preview_twice_stops: bấm lại Nghe thử của cùng khối thì dừng", async () => {
    previews.length = 0;
    const { store, f, log } = setup(handlers);
    await store.getState().preview("en", { ...OPTS, voice: null });
    await store.getState().preview("en", { ...OPTS, voice: null });
    expect(store.getState().previewing).toBeNull();
    expect(f.calls.filter((c) => c.cmd === "tts_preview")).toHaveLength(1);
    expect(f.calls.filter((c) => c.cmd === "tts_stop")).toHaveLength(1);
    expect(log.at(-1)).toBe("stop");
  });

  it("đọc xong thì hết trạng thái nghe thử; stop cũng dừng nghe thử", async () => {
    previews.length = 0;
    const { store, idle } = setup(handlers);
    await store.getState().preview("vi", OPTS);
    previews[0]?.onmessage({ kind: "done" });
    idle[0]?.();
    expect(store.getState().previewing).toBeNull();
    await store.getState().preview("vi", OPTS);
    await store.getState().stop();
    expect(store.getState().previewing).toBeNull();
  });

  it("một lúc chỉ một lượt: nghe thử khối khác thay lượt cũ, đọc câu ở bản chép lời thì hết nghe thử", async () => {
    previews.length = 0;
    const { store, log } = setup(handlers);
    await store.getState().preview("vi", OPTS);
    await store.getState().preview("en", OPTS);
    expect(store.getState().previewing).toBe("en");
    log.length = 0;
    previews[0]?.onmessage(bytes(10)); // của lượt cũ, tới muộn
    expect(log).toEqual([]);
    await store.getState().speak(4, "a", "vi");
    expect(store.getState().previewing).toBeNull();
    expect(store.getState().speaking).toBe(4);
  });

  it("lệnh bị từ chối thì hiện lỗi, không văng", async () => {
    const { store } = setup({
      tts_preview: () => {
        throw { code: "ttsUnavailable", field: null, message: "modelMissing" };
      },
    });
    await expect(store.getState().preview("vi", OPTS)).resolves.toBeUndefined();
    expect(store.getState().previewing).toBeNull();
    expect(store.getState().error?.code).toBe("ttsUnavailable");
  });
});
