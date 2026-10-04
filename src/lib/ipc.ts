import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UiLanguage } from "../i18n";
import type { ModelsView } from "./models";
import type { ScrollDirection } from "./overlayScroll";

// Kiểu dữ liệu và tên lệnh, tên sự kiện giữa giao diện và lõi Rust (spec §6.10).
// Phía Rust là nơi quyết định: kiểu ở đây phải khớp `src-tauri/src/settings/mod.rs`, `state.rs`,
// `commands.rs` và `events.rs`.

export type Lang = "en" | "zh" | "ja" | "ko" | "vi";
export const LANGS: readonly Lang[] = ["en", "zh", "ja", "ko", "vi"];

export type AudioSource = { kind: "system" } | { kind: "device"; id: string } | { kind: "app"; bundleId: string };
export type Theme = "system" | "light" | "dark";
export type UpdateChannel = "stable" | "beta";
// Mã gói model trong manifest (`standard`, `lite`, hay gói thêm sau bằng manifest).
export type ModelTier = string;
export type HotkeyAction = "toggleSession" | "toggleOverlay" | "toggleLock" | "scrollUp" | "scrollDown";
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  "toggleSession",
  "toggleOverlay",
  "toggleLock",
  "scrollUp",
  "scrollDown",
];

// Màu chữ và màu nền của phụ đề (§4.3, `settings::TextColor`, `settings::BackgroundColor`); mã màu ở `subtitleView.ts`.
export type TextColor = "white" | "yellow" | "green" | "lightBlue" | "orange";
export type BackgroundColor = "black" | "darkGray" | "navy" | "darkBrown" | "darkPurple";

// Cạnh hay góc của thanh phụ đề đang kéo để đổi kích thước (`overlay::placement::Edge`).
export type ResizeEdge = "north" | "south" | "east" | "west" | "northEast" | "northWest" | "southEast" | "southWest";

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
    // Không còn dùng: thanh giữ mọi câu và cuộn được (§4.4). Giữ khóa để file cài đặt cũ vẫn đọc được.
    lines: number;
    opacity: number;
    textColor: TextColor;
    background: BackgroundColor;
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
  // Số thứ tự của bản cài đặt trong lần chạy này của app: bản có số nhỏ hơn bản đang có là cũ, bỏ qua.
  revision: number;
}

// Bản sửa gửi cho `update_settings`. Không có `hotkeys` (dùng `set_hotkey`), `overlay.locked`
// (dùng `set_overlay_locked`), `overlay.positions`, `overlay.lastMonitor` và `revision` (chỉ phía Rust ghi), `modelTier`
// (lệnh của quản lý model).
export type SettingsPatch = Partial<Omit<Settings, "hotkeys" | "overlay" | "experimental" | "revision" | "modelTier">> & {
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
  // Đang có gói trả phí còn hạn: tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) mở; không thì khóa.
  pro: boolean;
  // Hạn mức còn từ 5 phút trở xuống (§4.2 bước 2): nhắc trên thanh phụ đề và cửa sổ chính.
  quotaWarning: boolean;
  // Thời điểm hạn mức được reset (giây Unix); `null` khi không giới hạn.
  quotaResetAt: number | null;
  // Phiên bản app mới đã tải xong, cài ở lần thoát kế tiếp (kế hoạch 07b); `null` khi chưa có.
  updateReady: string | null;
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
  // Không còn dùng (xem `Settings.overlay.lines`).
  lines: number;
  opacity: number;
  textColor: TextColor;
  background: BackgroundColor;
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

// Bản chép lời của một phiên (`transcript::store::Transcript`). `startedAt`, `endedAt`: giờ Unix (ms); `start_ms`,
// `end_ms` của từng dòng tính từ `startedAt`. `session` là 0 với phiên đọc từ lịch sử.
export interface Transcript {
  session: number;
  startedAt: number;
  endedAt: number | null;
  targetLang: string;
  lines: Subtitle[];
}

// Bản chép lời nào: của phiên hiện tại (hoặc vừa dừng), hay một phiên trong lịch sử (`data::TranscriptRef`).
export type TranscriptRef = { kind: "current" } | { kind: "history"; id: number };
export type ExportFormat = "txt" | "srt" | "markdown";
export type SrtText = "source" | "translation";

// Một phiên trong Lịch sử (`transcript::history::SessionSummary`).
export interface SessionSummary {
  id: number;
  startedAt: number;
  endedAt: number;
  targetLang: string;
  lines: number;
  preview: string;
}

// Một cặp thuật ngữ (`glossary::GlossaryEntry`) và kết quả nhập CSV (`glossary::ImportReport`).
export interface GlossaryEntry {
  id: number;
  source: string;
  target: string;
}

export interface ImportReport {
  added: number;
  updated: number;
  skipped: number;
  overLimit: number;
}

// Số đo của một phiên đã dừng, cho bảng debug ẩn (`debug::DebugSession`). Không có chữ chép lời.
export interface DebugStage {
  name: "vad" | "asr" | "mt" | "total";
  count: number;
  p50: number | null;
  p90: number | null;
}

export interface DebugSession {
  session: number;
  endedAt: number;
  summary: string;
  segments: number;
  filtered: number;
  dropped: number;
  translated: number;
  failed: number;
  skipped: number;
  sameLang: number;
  merges: number;
  translatedSpeechMs: number;
  stages: DebugStage[];
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

// Bản quyền (kế hoạch 06; `license::manager::LicenseView`). Không có key đầy đủ hay token: `key` đã che.
export type LicensePlan = "free" | "pro" | "pro_x2" | "pro_x5";
export type Standing =
  | "free"
  | "active"
  | "expired"
  | "revoked"
  | "refreshNeeded"
  | "clockRolledBack"
  | "unverified"
  | "notGenuine";

export interface QuotaView {
  unlimited: boolean;
  limitMs: number;
  usedMs: number;
  remainingMs: number;
  resetAt: number | null;
  resetKind: "daily" | "cycle" | "expiry";
  needsNetwork: boolean;
  lost: boolean;
  storageError: boolean;
}

export interface LicenseView {
  standing: Standing;
  plan: LicensePlan;
  licensedPlan: Exclude<LicensePlan, "free"> | null;
  key: string | null;
  expiresAt: number | null;
  refreshBefore: number | null;
  validatedAt: number | null;
  renewSoon: boolean;
  quota: QuotaView;
  serverConfigured: boolean;
  devOverride: boolean;
  // Giờ máy bị coi là chỉnh lùi (cả ở gói Free): nhắc chỉnh giờ.
  clockRolledBack: boolean;
}

// Một máy đã kích hoạt, trong `409 device_limit` (`license::client::Device`). `device_label` có thể là `null`.
export interface Device {
  activation_id: string;
  device_label: string | null;
  last_validated_at: number | null;
}

export interface ActivateOutcome {
  view: LicenseView | null;
  devices: Device[] | null;
}

// Gói đang bán (`GET /v1/plans`).
export interface PlanOffer {
  code: Exclude<LicensePlan, "free">;
  name: string;
  quota_minutes_per_cycle: number | null;
  days_per_order: number;
  prices: Record<string, number>;
}

export interface CheckoutView {
  orderCode: number;
  plan: string;
  amount: number;
  currency: string;
  expiresAt: number;
  qrSvg: string;
  licenseExpiresAt: number | null;
  convertedDays: number | null;
}

// Kết quả mỗi lần hỏi đơn (`license::purchase::OrderOutcome`).
export type OrderOutcome =
  | { state: "waiting"; order_code: number; expires_at: number }
  | { state: "paid"; order_code: number; plan: string }
  | { state: "underpaid"; order_code: number }
  | { state: "needsReview"; order_code: number }
  | { state: "refunded"; order_code: number }
  | { state: "failed"; order_code: number }
  | { state: "paidButNotApplied"; order_code: number; code: string };

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
  // Bước "Nghe thử": phiên thu toàn hệ thống, kể cả âm thanh của chính app. Dừng bằng `toggle_session`.
  start_listen_test: { args: undefined; result: AppStatus };
  get_transcript: { args: undefined; result: Transcript };
  // `utcOffsetMinutes`: độ lệch múi giờ của máy (phút, dương ở phía đông), để ghi giờ địa phương.
  transcript_text: { args: { source: TranscriptRef; utcOffsetMinutes: number }; result: string };
  // Pro. Trả đường dẫn đã ghi, `null` nếu người dùng bấm Hủy ở hộp thoại lưu.
  export_transcript: {
    args: { source: TranscriptRef; format: ExportFormat; srtText: SrtText; utcOffsetMinutes: number };
    result: string | null;
  };
  list_history: { args: undefined; result: SessionSummary[] };
  get_history_session: { args: { id: number }; result: Transcript };
  delete_history_session: { args: { id: number }; result: null };
  clear_history: { args: undefined; result: number };
  list_glossary: { args: undefined; result: GlossaryEntry[] };
  add_glossary_entry: { args: { source: string; target: string }; result: GlossaryEntry };
  update_glossary_entry: { args: { id: number; source: string; target: string }; result: GlossaryEntry };
  delete_glossary_entry: { args: { id: number }; result: null };
  // `null` nếu người dùng bấm Hủy ở hộp thoại mở hay lưu file.
  import_glossary_csv: { args: undefined; result: ImportReport | null };
  export_glossary_csv: { args: undefined; result: string | null };
  clear_all_data: { args: undefined; result: null };
  get_debug_sessions: { args: undefined; result: DebugSession[] };
  get_overlay_view: { args: undefined; result: OverlayView };
  get_license: { args: undefined; result: LicenseView | null };
  activate_license: { args: { key: string }; result: ActivateOutcome };
  deactivate_license: { args: undefined; result: LicenseView | null };
  deactivate_other_device: { args: { key: string; activationId: string }; result: null };
  validate_license: { args: undefined; result: LicenseView | null };
  get_plans: { args: undefined; result: PlanOffer[] };
  start_checkout: { args: { plan: string; email: string; consent: boolean; renew: boolean }; result: CheckoutView };
  get_pending_order: { args: undefined; result: CheckoutView | null };
  cancel_checkout: { args: undefined; result: null };
  open_checkout_page: { args: undefined; result: null };
  recover_license: { args: { email: string }; result: null };
  restart_to_update: { args: undefined; result: null };
  hide_overlay: { args: undefined; result: null };
  begin_overlay_resize: { args: { edge: ResizeEdge }; result: null };
  overlay_resize_move: { args: undefined; result: null };
  end_overlay_resize: { args: undefined; result: null };
  // Quản lý model (kế hoạch 04). `load_models` tải manifest nếu chưa có hay đã quá một ngày; `download_models` trả về
  // ngay, tiến độ tới qua sự kiện `models://state`; tải xong thì gói thành gói đang dùng.
  get_models_state: { args: undefined; result: ModelsView };
  load_models: { args: undefined; result: ModelsView };
  download_models: { args: { pack: string }; result: ModelsView };
  pause_models_download: { args: undefined; result: ModelsView };
  select_model_pack: { args: { pack: string }; result: Settings };
  delete_models: { args: { pack: string }; result: ModelsView };
  delete_models_and_data: { args: undefined; result: ModelsView };
  dismiss_models_update: { args: undefined; result: ModelsView };
  // "Tải lại": băm lại gói, bỏ file hỏng (để lần tải sau chỉ tải lại chúng).
  verify_models: { args: { pack: string }; result: ModelsView };
}

export interface Events {
  "settings://changed": Settings;
  "app://status": AppStatus;
  "app://navigate": Navigate;
  "app://notice": AppNotice;
  "overlay://view": OverlayView;
  // Phím tắt cuộn lên hay xuống (§4.4): dùng được cả khi thanh khóa, lúc con lăn chuột xuyên qua thanh.
  "overlay://scroll": ScrollDirection;
  "license://changed": LicenseView;
  "license://order": OrderOutcome;
  "subtitle://upsert": Subtitle;
  "subtitle://delta": SubtitleDelta;
  // Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch; tới cả cửa sổ chính lẫn thanh phụ đề.
  "audio://level": number;
  // Trạng thái quản lý model (kế hoạch 04).
  "models://state": ModelsView;
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
