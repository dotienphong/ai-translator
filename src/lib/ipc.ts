import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UiLanguage } from "../i18n";

// Kiểu dữ liệu và tên lệnh, tên sự kiện giữa giao diện và lõi Rust (spec §6.10).
// Phía Rust là nơi quyết định: kiểu ở đây phải khớp `src-tauri/src/settings/mod.rs`, `state.rs`,
// `commands.rs` và `events.rs`.

export type Lang = "en" | "zh" | "ja" | "ko" | "vi";
export const LANGS: readonly Lang[] = ["en", "zh", "ja", "ko", "vi"];

export type AudioSource = { kind: "system" } | { kind: "device"; id: string } | { kind: "app"; bundleId: string };
export type Theme = "system" | "light" | "dark";
export type UpdateChannel = "stable" | "beta";
export type ModelTier = "standard" | "lite";
export type HotkeyAction = "toggleSession" | "toggleOverlay" | "toggleLock";
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = ["toggleSession", "toggleOverlay", "toggleLock"];

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
  // Lần cuối thanh phụ đề nằm trên màn hình này (giây Unix).
  lastUsed: number;
}

export interface Settings {
  uiLanguage: UiLanguage;
  targetLanguage: Lang;
  sourceLanguages: Lang[];
  sourceLock: Lang | null;
  audioSource: AudioSource;
  vadEndSilenceMs: number;
  overlay: {
    fontSize: number;
    lines: number;
    opacity: number;
    showSource: boolean;
    locked: boolean;
    positions: Record<string, OverlayRect>;
    lastMonitor: string | null;
  };
  modelTier: ModelTier | null;
  hotkeys: Record<HotkeyAction, string>;
  saveHistory: boolean;
  launchAtLogin: boolean;
  theme: Theme;
  updateChannel: UpdateChannel;
  experimental: { translationContext: boolean };
  onboardingDone: boolean;
}

// Bản sửa gửi cho `update_settings`. Không có `hotkeys` (dùng `set_hotkey`), `overlay.locked`
// (dùng `set_overlay_locked`), `overlay.positions` và `overlay.lastMonitor` (chỉ phía Rust ghi).
export type SettingsPatch = Partial<Omit<Settings, "hotkeys" | "overlay" | "experimental">> & {
  overlay?: Partial<Omit<Settings["overlay"], "locked" | "positions" | "lastMonitor">>;
  experimental?: Partial<Settings["experimental"]>;
};

// Trạng thái phiên (`state::SessionStatus`): "starting" là lúc chạy tiến trình phụ và mở nguồn âm thanh.
export type SessionStatus = "idle" | "starting" | "running" | "error";
// Đang chờ tiến trình phụ: nạp model, hay lần đầu chạy bản mới (lâu hơn, §6.5).
export type Loading = "model" | "firstRun";

// Chỉ báo của phiên (`pipeline::engine::Indicators`, §4.4, §9).
export interface Indicators {
  lagging: boolean;
  noAudio: boolean;
  translationUnavailable: boolean;
}

export interface AppStatus {
  session: SessionStatus;
  overlayVisible: boolean;
  hotkeyFailures: HotkeyAction[];
  loading: Loading | null;
  // Mã lỗi (`error.<mã>`) khi `session` là "error".
  sessionError: string | null;
  cpuFallback: boolean;
  suggestLite: boolean;
  indicators: Indicators;
  // macOS: âm thanh vào toàn im lặng tuyệt đối trong khi có app đang phát: nghi chưa được cấp quyền (§9).
  permissionSuspected: boolean;
  // macOS, nguồn một app: app đã chọn không phát tiếng nữa; phiên vẫn chạy, đang chờ app phát lại.
  waitingForApp: boolean;
  // Tăng mỗi lần trạng thái đổi: trạng thái có `rev` nhỏ hơn trạng thái đang có là cũ, bỏ qua.
  rev: number;
}

// Một lựa chọn ở Cài đặt › Âm thanh (`actions::AudioSourceOption`): macOS, app đang phát tiếng (tên hiển thị nếu có);
// Windows, thiết bị phát.
export type AudioSourceOption =
  | { kind: "app"; bundleId: string; name: string | null }
  | { kind: "device"; id: string; name: string };

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  platform: "macos" | "windows";
  launchedAtLogin: boolean;
}

export interface OverlayView {
  uiLanguage: UiLanguage;
  fontSize: number;
  lines: number;
  opacity: number;
  showSource: boolean;
  locked: boolean;
}

// Phụ đề (spec §6.6, `pipeline::subtitle::Subtitle`).
export interface Subtitle {
  id: number;
  start_ms: number;
  end_ms: number;
  src_lang: string;
  src_text: string;
  tgt_text: string;
  status: "asr_done" | "translating" | "done" | "failed" | "same_lang" | "skipped" | "dropped";
  provisional: boolean;
  // Id các phụ đề đã gộp vào phụ đề này khi hàng đợi dịch đầy (§7): xóa chúng đi.
  replaces: number[];
}

// Phần chữ dịch mới trong lúc đang dịch: nối vào `tgt_text` của phụ đề cùng `id`.
export interface SubtitleDelta {
  id: number;
  text: string;
}

export type Screen = "home" | "transcript" | "history" | "glossary" | "settings" | "upgrade" | "about";
export type SettingsGroup = "general" | "subtitles" | "audio" | "model" | "hotkeys" | "license" | "privacy";

export interface Navigate {
  screen: Screen;
  settingsGroup: SettingsGroup | null;
}

// Lời nhắc trong app do phía Rust gửi (`events::Notice`).
export type AppNotice = { kind: "quitFromTray" } | { kind: "loginItemsApproval" };

// Lỗi phía Rust trả về (`CommandError`).
export interface CommandError {
  code: string;
  field: string | null;
  message: string;
}

export interface Commands {
  get_settings: { args: undefined; result: Settings };
  update_settings: { args: { patch: SettingsPatch }; result: Settings };
  set_hotkey: { args: { action: HotkeyAction; accelerator: string }; result: Settings };
  get_app_status: { args: undefined; result: AppStatus };
  // Chờ tới khi phiên chạy (có thể vài chục giây lúc nạp model). Lỗi thì reject với `CommandError`, và trạng thái
  // phiên là "error" kèm `sessionError`.
  toggle_session: { args: undefined; result: AppStatus };
  set_overlay_visible: { args: { visible: boolean }; result: AppStatus };
  set_overlay_locked: { args: { locked: boolean }; result: Settings };
  get_app_info: { args: undefined; result: AppInfo };
  open_log_dir: { args: undefined; result: null };
  open_taskbar_settings: { args: undefined; result: null };
  open_login_items_settings: { args: undefined; result: null };
  list_audio_sources: { args: undefined; result: AudioSourceOption[] };
  open_audio_permission_settings: { args: undefined; result: null };
  get_overlay_view: { args: undefined; result: OverlayView };
}

export interface Events {
  "settings://changed": Settings;
  "app://status": AppStatus;
  "app://navigate": Navigate;
  "app://notice": AppNotice;
  "overlay://view": OverlayView;
  "subtitle://upsert": Subtitle;
  "subtitle://delta": SubtitleDelta;
  // Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch.
  "audio://level": number;
}

export type Command = keyof Commands;
export type EventName = keyof Events;

// Lớp mỏng quanh `invoke` và `listen`, để store test được với bản giả.
export interface Ipc {
  invoke<C extends Command>(cmd: C, args?: Commands[C]["args"]): Promise<Commands[C]["result"]>;
  listen<E extends EventName>(event: E, handler: (payload: Events[E]) => void): Promise<() => void>;
}

export const tauriIpc: Ipc = {
  invoke: (cmd, args) => invoke(cmd, args),
  listen: (event, handler) => listen(event, (e) => handler(e.payload as never)),
};
