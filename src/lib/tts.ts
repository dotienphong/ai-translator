// Giọng đọc bản dịch (spec 2026-11-02-doc-ban-dich-tts-design): phát PCM `i16` 48 kHz mono do phía Rust gửi, bằng Web Audio (không
// thêm thư viện âm thanh native). Từng đoạn được xếp lịch nối tiếp nhau trên đồng hồ của AudioContext nên không có khe hở; mỗi
// đoạn báo cho phía Rust còn bao nhiêu ms âm thanh sắp phát (`markPlaying`), để lõi thu bỏ qua tiếng đọc của chính app (spec §5).
// Phía Rust tự hết hạn cờ đó, nên giao diện hỏng cũng không làm lõi thu kẹt ở "đang đọc".

export type TtsLang = "vi" | "en";

// v3 Turbo chỉ đọc được tiếng Việt và tiếng Anh; câu dịch ra Hàn, Trung, Nhật không có nút nghe.
export const canSpeakLang = (lang: string): lang is TtsLang => lang === "vi" || lang === "en";

export const TTS_SAMPLE_RATE = 48_000;
// Xếp đoạn đầu cách "bây giờ" chút ít để kịp đưa vào bộ phát.
const LEAD_S = 0.06;
// Báo thừa chút âm thanh phía sau để khe giữa hai đoạn không làm cờ chặn thu tắt sớm.
const TAIL_MS = 300;

// Byte little-endian `i16` → mẫu thực [-1, 1).
export function pcm16ToFloat32(bytes: ArrayBuffer): Float32Array {
  const view = new DataView(bytes);
  const n = bytes.byteLength >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

// Phần của Web Audio mà bộ phát dùng, để test bằng bản giả.
export interface AudioBufferLike {
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}
export interface SourceLike {
  buffer: AudioBufferLike | null;
  onended: (() => void) | null;
  connect(destination: unknown): unknown;
  start(when?: number): void;
  stop(): void;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): SourceLike;
  resume(): Promise<void>;
}

export interface PlayerDeps {
  createContext(): AudioContextLike;
  // Còn `ms` ms âm thanh đã xếp lịch: gia hạn cờ chặn thu ở phía Rust (`tts_mark_playing`).
  markPlaying(ms: number): void;
  // Hẹn giờ; test thay bằng bản giả.
  setTimer?(callback: () => void, ms: number): number;
  clearTimer?(id: number): void;
}

export class TtsPlayer {
  private ctx: AudioContextLike | null = null;
  private nextTime = 0;
  private sources = new Set<SourceLike>();
  private timer: number | null = null;
  // Tăng mỗi lần `begin`/`stop`: hẹn giờ và hàm gọi lại của lượt cũ không còn tác dụng.
  private generation = 0;

  constructor(private readonly deps: PlayerDeps) {}

  // Bắt đầu một lượt mới; lượt cũ (nếu còn) bị dừng. Gọi trong lúc xử lý thao tác của người dùng (bấm nút), vì trình duyệt chỉ cho
  // AudioContext phát khi có thao tác.
  begin(): void {
    this.stopSources();
    this.generation += 1;
    this.ctx ??= this.deps.createContext();
    void this.ctx.resume().catch(() => {});
    this.nextTime = 0;
  }

  // Chuẩn bị trước khi có tiếng: tạo AudioContext, đánh thức nó và mở thiết bị phát bằng một mẫu im lặng, để câu đọc đầu tiên không
  // phải chờ khởi động âm thanh. Gọi ngay trong thao tác bấm của người dùng (trình duyệt chỉ cho phát khi có thao tác). Lỗi nào cũng bỏ qua.
  prepare(): void {
    try {
      this.ctx ??= this.deps.createContext();
      const ctx = this.ctx;
      void ctx.resume().catch(() => {});
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, TTS_SAMPLE_RATE);
      source.connect(ctx.destination);
      source.start();
    } catch {
      // Không chuẩn bị được thì lần đọc đầu tự khởi động như cũ.
    }
  }

  // Xếp lịch một đoạn PCM; trả độ dài (giây). Chưa `begin` thì bỏ.
  push(bytes: ArrayBuffer): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const samples = pcm16ToFloat32(bytes);
    if (samples.length === 0) return 0;
    const buffer = ctx.createBuffer(1, samples.length, TTS_SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(this.nextTime, ctx.currentTime + LEAD_S);
    source.onended = () => this.sources.delete(source);
    source.start(startAt);
    this.sources.add(source);
    this.nextTime = startAt + buffer.duration;
    this.deps.markPlaying(Math.ceil((this.nextTime - ctx.currentTime) * 1000) + TAIL_MS);
    return buffer.duration;
  }

  // Gọi `done` khi mọi âm thanh đã xếp lịch phát xong (lượt vẫn là lượt hiện tại).
  whenIdle(done: () => void): void {
    const ctx = this.ctx;
    const generation = this.generation;
    const remainingMs = ctx ? Math.max(0, this.nextTime - ctx.currentTime) * 1000 : 0;
    this.clearTimer();
    const set = this.deps.setTimer ?? ((cb, ms) => window.setTimeout(cb, ms));
    this.timer = set(() => {
      this.timer = null;
      if (generation === this.generation) done();
    }, remainingMs + 50);
  }

  // Dừng ngay mọi âm thanh đang phát và đã xếp lịch.
  stop(): void {
    this.generation += 1;
    this.clearTimer();
    this.stopSources();
    this.nextTime = 0;
  }

  private stopSources(): void {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Nguồn chưa kịp `start` hay đã dừng: bỏ qua.
      }
    }
    this.sources.clear();
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    const clear = this.deps.clearTimer ?? ((id) => window.clearTimeout(id));
    clear(this.timer);
    this.timer = null;
  }
}
