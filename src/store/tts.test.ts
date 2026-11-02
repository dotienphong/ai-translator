import type { Channel } from "@tauri-apps/api/core";
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { TtsControl, TtsStatus } from "../lib/ipc";
import { createTtsStore } from "./tts";

type Msg = ArrayBuffer | TtsControl;
type FakeChannel = { onmessage: (m: Msg) => void };

const AVAILABLE: TtsStatus = { available: true, running: false, reason: null };

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
