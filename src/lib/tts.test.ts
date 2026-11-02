import { describe, expect, it } from "vitest";
import {
  type AudioContextLike,
  type SourceLike,
  TTS_SAMPLE_RATE,
  TtsPlayer,
  canSpeakLang,
  pcm16ToFloat32,
} from "./tts";

function pcm(...samples: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  samples.forEach((s, i) => view.setInt16(i * 2, s, true));
  return buf;
}

// AudioContext giả: đồng hồ chạy tay, ghi lại các nguồn đã xếp lịch.
function fakeContext() {
  const sources: (SourceLike & { startedAt: number | null; stopped: boolean })[] = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    resumed: 0,
    createBuffer: (_ch: number, length: number, rate: number) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const s = {
        buffer: null,
        onended: null,
        startedAt: null as number | null,
        stopped: false,
        connect: () => undefined,
        start(when?: number) {
          this.startedAt = when ?? 0;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(s);
      return s;
    },
    async resume() {
      this.resumed += 1;
    },
  };
  return { ctx: ctx as unknown as AudioContextLike & { currentTime: number; resumed: number }, sources };
}

function player() {
  const { ctx, sources } = fakeContext();
  const marks: number[] = [];
  const timers: { cb: () => void; ms: number; id: number }[] = [];
  const p = new TtsPlayer({
    createContext: () => ctx,
    markPlaying: (ms) => marks.push(ms),
    setTimer: (cb, ms) => {
      const id = timers.length + 1;
      timers.push({ cb, ms, id });
      return id;
    },
    clearTimer: (id) => {
      const at = timers.findIndex((t) => t.id === id);
      if (at >= 0) timers.splice(at, 1);
    },
  });
  return { p, ctx, sources, marks, timers };
}

describe("pcm16ToFloat32", () => {
  it("đọc i16 little-endian thành mẫu thực", () => {
    const out = pcm16ToFloat32(pcm(0, 16384, -16384, 32767, -32768));
    expect([...out]).toEqual([0, 0.5, -0.5, 32767 / 32768, -1]);
  });

  it("bỏ byte lẻ ở cuối", () => {
    expect(pcm16ToFloat32(new ArrayBuffer(5)).length).toBe(2);
    expect(pcm16ToFloat32(new ArrayBuffer(0)).length).toBe(0);
  });
});

describe("canSpeakLang", () => {
  it("chỉ tiếng Việt và tiếng Anh", () => {
    expect(canSpeakLang("vi")).toBe(true);
    expect(canSpeakLang("en")).toBe(true);
    for (const l of ["ja", "zh", "ko", "", "VI"]) expect(canSpeakLang(l)).toBe(false);
  });
});

describe("TtsPlayer", () => {
  it("xếp các đoạn nối tiếp nhau, không khe hở", () => {
    const { p, sources } = player();
    p.begin();
    const d1 = p.push(pcm(...new Array<number>(4800).fill(1000))); // 0,1 s
    const d2 = p.push(pcm(...new Array<number>(9600).fill(1000))); // 0,2 s
    expect(d1).toBeCloseTo(4800 / TTS_SAMPLE_RATE);
    expect(d2).toBeCloseTo(9600 / TTS_SAMPLE_RATE);
    expect(sources).toHaveLength(2);
    expect(sources[0]?.startedAt).toBeCloseTo(0.06);
    expect(sources[1]?.startedAt).toBeCloseTo(0.06 + 0.1);
  });

  it("đoạn tới muộn (đã qua hết lịch) thì phát ngay chứ không về quá khứ", () => {
    const { p, ctx, sources } = player();
    p.begin();
    p.push(pcm(...new Array<number>(480).fill(1)));
    ctx.currentTime = 5;
    p.push(pcm(...new Array<number>(480).fill(1)));
    expect(sources[1]?.startedAt).toBeCloseTo(5.06);
  });

  it("báo phía Rust còn bao nhiêu ms âm thanh sắp phát", () => {
    const { p, marks } = player();
    p.begin();
    p.push(pcm(...new Array<number>(48_000).fill(1))); // 1 s
    // 1 s âm thanh + lead 60 ms + đệm 300 ms
    expect(marks[0]).toBe(1000 + 60 + 300);
  });

  it("whenIdle gọi sau khi âm thanh đã xếp lịch phát hết", () => {
    const { p, timers } = player();
    p.begin();
    p.push(pcm(...new Array<number>(48_000).fill(1)));
    let done = 0;
    p.whenIdle(() => (done += 1));
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBeCloseTo(1060 + 50, -1);
    timers[0]?.cb();
    expect(done).toBe(1);
  });

  it("stop dừng mọi nguồn và hủy hẹn giờ của lượt cũ", () => {
    const { p, sources, timers } = player();
    p.begin();
    p.push(pcm(...new Array<number>(480).fill(1)));
    let done = 0;
    p.whenIdle(() => (done += 1));
    p.stop();
    expect(sources.every((s) => s.stopped)).toBe(true);
    expect(timers).toHaveLength(0);
    expect(done).toBe(0);
  });

  it("begin của lượt mới dừng lượt cũ; hàm gọi lại của lượt cũ không chạy", () => {
    const { p, sources, timers } = player();
    p.begin();
    p.push(pcm(...new Array<number>(480).fill(1)));
    let old = 0;
    p.whenIdle(() => (old += 1));
    const staleTimer = timers[0];
    p.begin();
    expect(sources[0]?.stopped).toBe(true);
    staleTimer?.cb();
    expect(old).toBe(0);
  });

  it("chưa begin thì push bỏ qua", () => {
    const { p, sources } = player();
    expect(p.push(pcm(1, 2, 3))).toBe(0);
    expect(sources).toHaveLength(0);
  });

  it("dùng lại một AudioContext và gọi resume mỗi lượt", () => {
    const { p, ctx } = player();
    p.begin();
    p.begin();
    expect(ctx.resumed).toBe(2);
  });
});

describe("TtsPlayer.prepare", () => {
  it("tạo và đánh thức AudioContext, mở thiết bị bằng một mẫu im lặng, và dùng lại ở lượt đọc sau", () => {
    const { ctx, sources } = fakeContext();
    let created = 0;
    const player = new TtsPlayer({
      createContext: () => {
        created += 1;
        return ctx;
      },
      markPlaying: () => {},
    });
    player.prepare();
    expect(created).toBe(1);
    expect(ctx.resumed).toBe(1);
    expect(sources).toHaveLength(1);
    player.begin();
    expect(created).toBe(1);
  });

  it("lỗi khi chuẩn bị không văng ra ngoài", () => {
    const player = new TtsPlayer({
      createContext: () => {
        throw new Error("không có thiết bị");
      },
      markPlaying: () => {},
    });
    expect(() => player.prepare()).not.toThrow();
  });
});
