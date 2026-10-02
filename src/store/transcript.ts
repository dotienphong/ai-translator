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
  // `startedAt`: giờ bắt đầu của phiên (`Transcript.startedAt`); giờ trong chữ dựng ra theo độ lệch múi giờ lúc đó.
  copy(source: TranscriptRef, startedAt: number): Promise<void>;
  exportTo(source: TranscriptRef, format: ExportFormat, srtText: SrtText, startedAt: number): Promise<void>;
  dismiss(): void;
  // "Xóa toàn bộ dữ liệu" xong: bỏ bản chép lời đang hiện (N2 của review 03).
  reset(): void;
}

export interface TranscriptDeps {
  ipc: Ipc;
  writeClipboard(text: string): Promise<void>;
  // Độ lệch múi giờ của máy tại một thời điểm (giờ Unix, ms).
  offsetMinutes?: (at: number) => number;
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

      async copy(source, startedAt) {
        await run(async () => {
          const text = await ipc.invoke("transcript_text", { source, utcOffsetMinutes: offsetMinutes(startedAt) });
          await writeClipboard(text);
          return { kind: "copied" };
        });
      },

      async exportTo(source, format, srtText, startedAt) {
        await run(async () => {
          const path = await ipc.invoke("export_transcript", {
            source,
            format,
            srtText,
            utcOffsetMinutes: offsetMinutes(startedAt),
          });
          return path === null ? null : { kind: "exported", path };
        });
      },

      dismiss() {
        set({ notice: null, error: null });
      },

      reset() {
        removed = new Set();
        set({ transcript: empty(), notice: null, error: null });
      },
    };
  });
}

export type TranscriptStore = ReturnType<typeof createTranscriptStore>;
