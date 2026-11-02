import { type StoreApi, createStore } from "zustand/vanilla";
import type { Ipc } from "../lib/ipc";
import { type Queue, clear, dequeue, enqueue, skipToLatest } from "../lib/listenQueue";
import { LABEL_WAIT_MS, decide, isReadable } from "../lib/listenSource";
import { canSpeakLang } from "../lib/tts";
import type { OverlayStoreState } from "./overlay";
import type { TtsStoreState } from "./tts";

// "Nghe dịch" (spec 2026-11-02-nghe-dich-truc-tiep): khi bật, tiếng họp bị hạ (phía Rust) và mỗi câu dịch của tiếng máy chốt xong được đọc
// lần lượt bằng giọng đọc (`ttsStore`). Câu của micro (người dùng) không đọc. Lỗi của tính năng này chỉ làm nó tự tắt, không bao giờ ném
// ra ngoài store (mọi lời gọi IPC đều bọc lỗi).

export const DEFAULT_LEVEL = 10;
// Thấp nhất của thanh: đo thật trên Windows, hạ app còn 1% thì loopback còn ≈ −25 dB (bộ bù +26 dB còn đủ); thấp hơn thì nhận dạng không
// còn tiếng để dịch (spec 2026-11-02-nghe-dich-truc-tiep §2). Khớp `audio_ducking::MIN_LEVEL`.
export const MIN_LEVEL = 10;
// Gộp các lần kéo thanh trượt: chỉ gửi giá trị cuối, kẻo mỗi nấc đều là một lần liệt kê phiên âm thanh + ghi sổ.
const LEVEL_DEBOUNCE_MS = 150;
// Từng ấy lần đọc lỗi liên tiếp thì tắt hẳn "Nghe dịch" (trả tiếng họp), kẻo họp bị hạ mà không có gì được đọc.
const MAX_TTS_FAILURES = 2;
const LEVEL_KEY = "listen.level";
// Đã từng bật "Nghe dịch" trên máy này: phiên sau nạp sẵn giọng ngay khi phiên chạy, để câu đầu không phải chờ nạp model.
const USED_KEY = "listen.used";
// Giữ worker giọng đọc không bị tắt vì rảnh (5 phút) trong lúc đang bật: gọi nạp sẵn (rẻ khi đã nạp) định kỳ.
const KEEPALIVE_MS = 150_000;
// Chờ nhãn giọng thì kiểm lại mỗi chừng này (hay sớm hơn nếu sắp hết hạn).
const RECHECK_MS = 250;
// Từng ấy câu đọc liền mà phiên chế độ both vẫn không có nhãn giọng nào thì báo "chưa phân biệt được lời của bạn".
const UNRESOLVED_AFTER = 3;

// Chỉ cần đọc và theo dõi: store thật (rộng hơn) gán được vào đây.
type Readable<T> = Pick<StoreApi<T>, "getState" | "subscribe">;

export interface ListenDeps {
  ipc: Ipc;
  tts: Readable<Pick<TtsStoreState, "speaking" | "error" | "speak" | "stop"> & Partial<Pick<TtsStoreState, "prepare">>>;
  overlay: Readable<Pick<OverlayStoreState, "lines" | "voices" | "view"> & { status?: { session: string } | null }>;
  now(): number;
  // Hẹn gọi `fn` sau `ms`; trả hàm hủy.
  setTimer(fn: () => void, ms: number): () => void;
  storage: Pick<Storage, "getItem" | "setItem">;
}

export interface ListenStoreState {
  supported: boolean;
  active: boolean;
  // Phần trăm tiếng họp còn lại khi đang đọc (0–100).
  level: number;
  // Số câu đang chờ đọc.
  pending: number;
  // `listenFailed`, `listenUnsupported`, `ttsFailed`…: mã cho `error.<mã>`. Giữ tới khi tắt/bật lại hay `dismiss`.
  error: string | null;
  // Chế độ both mà không có nhãn giọng nào: không phân biệt được lời của người dùng.
  unresolved: boolean;
  init(): Promise<void>;
  toggle(): Promise<void>;
  setLevel(level: number): Promise<void>;
  skip(): void;
  dismiss(): void;
}

function readLevel(storage: ListenDeps["storage"]): number {
  try {
    const n = Number.parseInt(storage.getItem(LEVEL_KEY) ?? "", 10);
    return Number.isFinite(n) && n >= MIN_LEVEL && n <= 100 ? n : DEFAULT_LEVEL;
  } catch {
    return DEFAULT_LEVEL;
  }
}

export function createListenStore(deps: ListenDeps) {
  let queue: Queue = { items: [], seen: new Set() };
  let cancelRecheck: (() => void) | null = null;
  let inFlight = false;
  let unlabelledRead = 0;
  let lastLines: unknown = null;
  let started = false;
  const warm = () => void deps.ipc.invoke("overlay_tts_warmup").catch(() => {});
  const wasUsed = () => {
    try {
      return deps.storage.getItem(USED_KEY) === "1";
    } catch {
      return false;
    }
  };
  let failStreak = 0;
  let lastTtsError: unknown = null;
  let wasSpeaking = false;
  let cancelLevelSend: (() => void) | null = null;

  const store = createStore<ListenStoreState>()((set, get) => {
    const ids = () => new Set(deps.overlay.getState().lines.map((l) => l.id));

    const resetQueue = () => {
      queue = clear(queue);
      cancelRecheck?.();
      cancelRecheck = null;
      inFlight = false;
      set({ pending: 0 });
    };

    const schedule = (ms: number) => {
      if (cancelRecheck) return;
      cancelRecheck = deps.setTimer(
        () => {
          cancelRecheck = null;
          pump();
        },
        Math.max(1, Math.min(RECHECK_MS, ms)),
      );
    };

    function pump() {
      if (!get().active) return;
      const overlay = deps.overlay.getState();
      const view = overlay.view;
      if (!view) return;
      const lang = view.targetLanguage;
      // Chỉ quét lại danh sách dòng khi nó đổi (overlay cập nhật cả mức âm lượng 10 lần mỗi giây).
      if (overlay.lines !== lastLines) {
        lastLines = overlay.lines;
        for (const l of overlay.lines) {
          if (!queue.seen.has(l.id) && isReadable(l, lang)) queue = enqueue(queue, l, deps.now());
        }
      }
      while (!inFlight && deps.tts.getState().speaking === null && canSpeakLang(lang)) {
        const [item, rest] = dequeue(queue);
        if (!item) break;
        const line = overlay.lines.find((l) => l.id === item.id);
        const age = deps.now() - item.since;
        const decision = line ? decide(line, overlay.voices, view.captureMode, age) : "read";
        if (decision === "wait") {
          schedule(LABEL_WAIT_MS - age);
          break;
        }
        queue = rest;
        if (decision === "skip") continue;
        if (view.captureMode === "both" && line && line.speaker === null && overlay.voices.size === 0) {
          unlabelledRead += 1;
          if (unlabelledRead >= UNRESOLVED_AFTER && !get().unresolved) set({ unresolved: true });
        }
        inFlight = true;
        const finished = () => {
          if (deps.tts.getState().speaking === null) {
            inFlight = false;
            pump();
          }
        };
        deps.tts.getState().speak(item.id, item.text, lang).then(finished, finished);
        break;
      }
      if (get().pending !== queue.items.length) set({ pending: queue.items.length });
    }

    // Chỉ dừng giọng đọc khi chính ta đang đọc: giọng đọc dùng chung với cửa sổ chính, không hủy lượt đọc của nó vô cớ.
    const stopReading = async () => {
      if (deps.tts.getState().speaking === null) return;
      try {
        await deps.tts.getState().stop();
      } catch {
        // Giọng đọc đã tự dọn; không còn gì để làm.
      }
    };

    // Lõi báo đã tắt (lỗi, phiên dừng, thanh ẩn): chỉ cập nhật giao diện.
    const turnOff = async (error: string | null) => {
      cancelLevelSend?.();
      cancelLevelSend = null;
      set({ active: false, error: error ?? get().error });
      resetQueue();
      await stopReading();
    };

    // Ta tự tắt (bấm nút, hay đọc lỗi liên tiếp): cập nhật giao diện rồi bảo lõi trả tiếng họp.
    const stopListening = async (error: string | null) => {
      await turnOff(error);
      try {
        await deps.ipc.invoke("overlay_listen_set", { enabled: false, level: get().level });
      } catch {
        // Phía Rust tự trả âm lượng khi thoát; không có gì để làm thêm.
      }
    };

    return {
      // Chưa hỏi lõi thì chưa hiện nút (macOS không hỗ trợ: nút không nhấp nháy rồi biến mất).
      supported: false,
      active: false,
      level: DEFAULT_LEVEL,
      pending: 0,
      error: null,
      unresolved: false,

      async init() {
        if (started) return;
        started = true;
        set({ level: readLevel(deps.storage) });
        try {
          const status = await deps.ipc.invoke("overlay_listen_status");
          set({ supported: status.supported });
          // Overlay nạp lại (hay lần chạy trước sập) mà lõi còn đang hạ: giao diện mới không biết gì về hàng đợi, nên tắt cho khớp.
          if (status.active) await deps.ipc.invoke("overlay_listen_set", { enabled: false, level: get().level });
        } catch {
          set({ supported: false });
        }
        deps.overlay.subscribe(pump);
        // Phiên vừa chạy mà người dùng từng dùng "Nghe dịch": nạp giọng nền ngay (mất vài giây), không đợi tới lúc bật nút.
        let sessionRunning = deps.overlay.getState().status?.session === "running";
        deps.overlay.subscribe((o) => {
          const running = o.status?.session === "running";
          if (running && !sessionRunning && get().supported && wasUsed()) warm();
          sessionRunning = running;
        });
        const keepAlive = () => {
          deps.setTimer(() => {
            if (get().active) warm();
            keepAlive();
          }, KEEPALIVE_MS);
        };
        keepAlive();
        deps.tts.subscribe((tts) => {
          // Lỗi đọc một câu: giữ để báo, không chặn hàng đợi.
          if (tts.error && tts.error !== lastTtsError) {
            lastTtsError = tts.error;
            failStreak += 1;
            if (get().error !== tts.error.code) set({ error: tts.error.code });
            if (failStreak >= MAX_TTS_FAILURES && get().active) {
              void stopListening(tts.error.code);
              return;
            }
          } else if (wasSpeaking && tts.speaking === null && !tts.error) {
            failStreak = 0;
          }
          wasSpeaking = tts.speaking !== null;
          if (tts.speaking === null) inFlight = false;
          pump();
        });
        try {
          await deps.ipc.listen("listen://state", (state) => {
            if (!state.active && get().active) void turnOff(state.error);
            else if (state.error) set({ error: state.error });
          });
        } catch {
          // Không nghe được sự kiện: chỉ mất báo lỗi bất đồng bộ.
        }
      },

      async toggle() {
        // Trước mọi `await` (còn trong thao tác bấm): mở sẵn bộ phát âm thanh để câu đầu không chờ khởi động.
        if (!get().active) deps.tts.getState().prepare?.();
        if (get().active) {
          await stopListening(null);
          return;
        }
        failStreak = 0;
        lastTtsError = deps.tts.getState().error;
        set({ error: null, unresolved: false });
        try {
          const status = await deps.ipc.invoke("overlay_listen_set", { enabled: true, level: get().level });
          if (!status.supported) {
            set({ supported: false, active: false });
            return;
          }
        } catch {
          set({ active: false, error: "listenFailed" });
          return;
        }
        queue = { items: [], seen: ids() };
        lastLines = null;
        unlabelledRead = 0;
        inFlight = false;
        set({ active: true, pending: 0 });
        // Nạp sẵn giọng (lần đầu mất vài giây) để câu đầu không bị trễ; nhớ đã dùng để phiên sau nạp sớm hơn.
        warm();
        try {
          deps.storage.setItem(USED_KEY, "1");
        } catch {
          // Không lưu được: chỉ không nạp sớm ở phiên sau.
        }
        pump();
      },

      async setLevel(level) {
        const next = Math.min(100, Math.max(MIN_LEVEL, Math.round(Number.isFinite(level) ? level : DEFAULT_LEVEL)));
        set({ level: next });
        try {
          deps.storage.setItem(LEVEL_KEY, String(next));
        } catch {
          // Không lưu được: chỉ không nhớ lần sau.
        }
        if (!get().active) return;
        // Gộp các lần kéo: chỉ gửi giá trị cuối sau một khoảng ngắn.
        cancelLevelSend?.();
        cancelLevelSend = deps.setTimer(() => {
          cancelLevelSend = null;
          if (!get().active) return;
          deps.ipc.invoke("overlay_listen_set", { enabled: true, level: get().level }).catch(() => set({ error: "listenFailed" }));
        }, LEVEL_DEBOUNCE_MS);
      },

      skip() {
        queue = skipToLatest(queue);
        set({ pending: queue.items.length });
      },

      dismiss() {
        set({ error: null });
      },
    };
  });
  return store;
}
