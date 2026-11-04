import type { Channel } from "@tauri-apps/api/core";
import { createStore } from "zustand/vanilla";
import type { Ipc, TtsControl, TtsStatus, TtsVoices } from "../lib/ipc";
import type { TtsLang, TtsPlayer } from "../lib/tts";
import { type UiError, toUiError } from "./app";

// Nút nghe bản dịch (spec 2026-11-02-doc-ban-dich-tts-design): bấm một câu thì phía Rust đọc và gửi âm thanh về qua một `Channel`;
// bộ phát (`TtsPlayer`) xếp lịch phát. Mỗi lúc chỉ đọc một câu: bấm câu khác thì câu đang đọc bị thay, bấm lại câu đang đọc thì dừng.
// Mặc định không hiện gì: `status.available` chỉ `true` khi máy có `tts-worker` và gói model giọng đọc.

// Tên lệnh: cửa sổ chính dùng `tts_*`, overlay dùng `overlay_tts_*` (mỗi lệnh thuộc đúng một cửa sổ, `acl_tests`). Danh sách giọng
// và Nghe thử (màn hình Giọng đọc, spec 2026-11-04-giong-doc §7) chỉ có ở cửa sổ chính.
export interface TtsCommands {
  status: "tts_status" | "overlay_tts_status";
  speak: "tts_speak" | "overlay_tts_speak";
  stop: "tts_stop" | "overlay_tts_stop";
  listVoices?: "tts_list_voices";
  preview?: "tts_preview";
}
export const MAIN_TTS_COMMANDS: TtsCommands = {
  status: "tts_status",
  speak: "tts_speak",
  stop: "tts_stop",
  listVoices: "tts_list_voices",
  preview: "tts_preview",
};
export const OVERLAY_TTS_COMMANDS: TtsCommands = { status: "overlay_tts_status", speak: "overlay_tts_speak", stop: "overlay_tts_stop" };

export interface TtsDeps {
  ipc: Ipc;
  // Mặc định lệnh của cửa sổ chính.
  commands?: TtsCommands;
  player: Pick<TtsPlayer, "begin" | "push" | "whenIdle" | "stop"> & Partial<Pick<TtsPlayer, "prepare">>;
  createChannel(): Channel<ArrayBuffer | TtsControl>;
}

// Giá trị Nghe thử: câu mẫu và các cài đặt đang chọn trên màn hình (chưa cần lưu).
export interface TtsPreviewOptions {
  text: string;
  voice: string | null;
  speed: number;
  pause: number;
  volume: number;
}

export interface TtsStoreState {
  // `null` tới khi hỏi xong lần đầu.
  status: TtsStatus | null;
  // Id câu đang đọc (hay đang chờ nạp giọng), `null` khi không đọc.
  speaking: number | null;
  // Đã bấm nhưng chưa có âm thanh đầu tiên (lần đầu phải nạp model, vài giây).
  loading: boolean;
  error: UiError | null;
  // Giọng của gói đã cài; `null` tới khi hỏi được (lỗi thì vẫn `null`).
  voices: TtsVoices | null;
  // Khối đang nghe thử ở màn hình Giọng đọc, `null` khi không nghe thử.
  previewing: TtsLang | null;
  init(): Promise<void>;
  refreshStatus(): Promise<void>;
  speak(lineId: number, text: string, lang: TtsLang): Promise<void>;
  // Hỏi danh sách giọng; từ đó về sau `tts://changed` hỏi lại (gói giọng có thể vừa tải xong hay đổi).
  loadVoices(): Promise<void>;
  // Nghe thử: bấm lại cùng khối (hay gọi `stop`) thì dừng. Một lúc chỉ một lượt, dùng chung với `speak`.
  preview(lang: TtsLang, opts: TtsPreviewOptions): Promise<void>;
  stop(): Promise<void>;
  // Khởi động sẵn bộ phát âm thanh (gọi trong thao tác bấm); xem `TtsPlayer.prepare`.
  prepare(): void;
  dismiss(): void;
}

const UNAVAILABLE: TtsStatus = { available: false, running: false, reason: null, progress: null };

// Gói model giọng đọc đang tải (hay chờ tải) về nền: hỏi lại trạng thái chừng này ms một lần cho tới khi xong.
export const TTS_POLL_MS = 3000;

function isPending(status: TtsStatus | null): boolean {
  return status !== null && !status.available && (status.reason === "downloading" || status.reason === "waiting");
}

export function createTtsStore(deps: TtsDeps) {
  // Mỗi lần bấm một số mới: âm thanh và thông báo của lượt cũ tới muộn thì bỏ.
  let turn = 0;
  let poll: ReturnType<typeof setTimeout> | null = null;
  // Đã đăng ký nghe `tts://changed` (init gọi lại thì không đăng ký thêm).
  let watching = false;
  // Đã gọi `loadVoices` (màn hình Giọng đọc đã mở): `tts://changed` thì hỏi lại danh sách giọng.
  let wantVoices = false;
  const commands = deps.commands ?? MAIN_TTS_COMMANDS;
  return createStore<TtsStoreState>()((set, get) => {
    // Một lượt đọc (câu ở bản chép lời hay Nghe thử): lượt mới thay lượt cũ; âm thanh qua kênh vào bộ phát, xong hay lỗi thì trả về
    // "không đọc". `who`: lượt này là câu nào hay khối nào.
    const play = async (
      who: Pick<TtsStoreState, "speaking" | "previewing">,
      start: (onEvent: Channel<ArrayBuffer | TtsControl>) => Promise<number>,
    ) => {
      const idle = { speaking: null, previewing: null, loading: false };
      const mine = ++turn;
      deps.player.stop();
      set({ ...who, loading: true, error: null });
      const channel = deps.createChannel();
      deps.player.begin();
      channel.onmessage = (message) => {
        if (mine !== turn) return;
        if (message instanceof ArrayBuffer) {
          if (get().loading) set({ loading: false });
          deps.player.push(message);
        } else if (message.kind === "done") {
          deps.player.whenIdle(() => {
            if (mine === turn) set(idle);
          });
        } else if (message.code === "cancelled") {
          // Lượt này vẫn là lượt hiện tại mà bị hủy: cửa sổ khác (giọng đọc dùng chung) đã thay nó. Ta tự bấm câu khác hay dừng thì
          // `turn` đã đổi và dòng `mine !== turn` ở trên đã bỏ qua. Trả trạng thái về "không đọc", không có lỗi.
          deps.player.stop();
          set(idle);
        } else {
          deps.player.stop();
          set({ ...idle, error: { code: "ttsFailed", field: null } });
          void get().refreshStatus();
        }
      };
      try {
        await start(channel);
      } catch (e) {
        if (mine !== turn) return;
        deps.player.stop();
        set({ ...idle, error: toUiError(e) });
        void get().refreshStatus();
      }
    };
    return {
      status: null,
      speaking: null,
      loading: false,
      error: null,
      voices: null,
      previewing: null,

      async init() {
        // Gói model về máy sau lúc mở app (cài mới: tải gói ASR rồi gói giọng đọc): phía Rust báo `tts://changed` để hỏi lại, nút
        // tự sáng lên mà không phải mở lại app. Đăng ký trước lần hỏi đầu để không lỡ sự kiện, và không chờ nó: nghe không được
        // thì thôi, trạng thái vẫn có từ lần hỏi đầu.
        if (!watching) {
          watching = true;
          const watch = async () => {
            try {
              await deps.ipc.listen("tts://changed", () => {
                void get().refreshStatus();
                if (wantVoices) void get().loadVoices();
              });
            } catch {
              watching = false;
            }
          };
          void watch();
        }
        await get().refreshStatus();
      },

      async refreshStatus() {
        if (poll !== null) {
          clearTimeout(poll);
          poll = null;
        }
        try {
          set({ status: await deps.ipc.invoke(commands.status) });
        } catch {
          set({ status: UNAVAILABLE });
        }
        // Đang tải giọng đọc về: hỏi lại tới khi xong, để nút tự sáng lên mà không phải mở lại app.
        if (isPending(get().status) && poll === null) {
          poll = setTimeout(() => {
            poll = null;
            void get().refreshStatus();
          }, TTS_POLL_MS);
        }
      },

      prepare() {
        deps.player.prepare?.();
      },

      async speak(lineId, text, lang) {
        if (get().speaking === lineId) {
          await get().stop();
          return;
        }
        await play({ speaking: lineId, previewing: null }, (onEvent) =>
          deps.ipc.invoke(commands.speak, { lang, text, onEvent }),
        );
      },

      async loadVoices() {
        if (!commands.listVoices) return;
        wantVoices = true;
        try {
          set({ voices: await deps.ipc.invoke(commands.listVoices) });
        } catch {
          // Chưa có gói giọng (hay worker chưa chạy được): màn hình chỉ có lựa chọn "Mặc định"; `tts://changed` sẽ hỏi lại.
        }
      },

      async preview(lang, opts) {
        const command = commands.preview;
        if (!command) return;
        if (get().previewing === lang) {
          await get().stop();
          return;
        }
        await play({ speaking: null, previewing: lang }, (onEvent) =>
          deps.ipc.invoke(command, { lang, ...opts, onEvent }),
        );
      },

      async stop() {
        turn += 1;
        deps.player.stop();
        set({ speaking: null, previewing: null, loading: false });
        try {
          await deps.ipc.invoke(commands.stop);
        } catch {
          // Phía Rust tự hết hạn cờ chặn thu; không có gì để làm thêm.
        }
      },

      dismiss() {
        set({ error: null });
      },
    };
  });
}
