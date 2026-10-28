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
// Thu gì (`settings::CaptureMode`, spec 2026-10-24-nguon-micro §3.1).
export type CaptureMode = "playback" | "mic" | "both";
// Một micro ở Cài đặt › Âm thanh (`actions::InputDeviceOption`).
export type InputDevice = { id: string; name: string; isDefault: boolean };
// Quyền micro (`get_mic_permission`); Windows không có "undetermined".
export type MicPermission = "granted" | "denied" | "undetermined";
// Vấn đề của micro trong phiên đang chạy (`state::MicIssue`).
export type MicIssue = "suspected" | "permission" | "unavailable";
export type Theme = "system" | "light" | "dark";
export type UpdateChannel = "stable" | "beta";
// Lần kiểm tra cập nhật do người dùng bấm (`state::UpdateCheck`): bản mới tải xong thì báo qua `updateReady`;
// "unavailable" là bản build không tự cập nhật (bản dev).
export type UpdateCheck = "idle" | "checking" | "downloading" | "upToDate" | "failed" | "unavailable";
// Mã gói model trong manifest (`standard`, `lite`, hay gói thêm sau bằng manifest).
export type ModelTier = string;
// Ngôn ngữ đích của Gõ dịch (`settings::ComposeTarget`, spec 2026-10-17-go-dich §2.1): "auto" là "tiếng người bên kia".
export type ComposeTarget = "auto" | Lang;
// "compose": mở ô soạn Gõ dịch (spec 2026-10-17-go-dich §1.1); chỉ đăng ký khi bật Gõ dịch.
export type HotkeyAction = "toggleSession" | "toggleOverlay" | "toggleLock" | "scrollUp" | "scrollDown" | "compose";
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  "toggleSession",
  "toggleOverlay",
  "toggleLock",
  "scrollUp",
  "scrollDown",
  "compose",
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
  captureMode: CaptureMode;
  micDevice: string | null;
  micNoiseFilter: boolean;
  vadEndSilenceMs: number;
  // Như `vadEndSilenceMs`, riêng cho chế độ có micro (micro, âm thanh máy + micro). Mặc định 50 ms.
  micEndSilenceMs: number;
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
  // Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6.3, Cài đặt › Phụ đề), mặc định bật. Đổi khi đang dịch thì có tác
  // dụng từ đoạn kế tiếp.
  translateWhileSpeaking: boolean;
  // "Phân biệt người nói" và "Lấy tên từ Teams, Meet, Zoom" (spec 2026-10-26-phan-biet-nguoi-noi §8.3), mặc định bật. Tắt "Phân biệt"
  // giữa phiên thì dừng ngay; bật thì có tác dụng từ phiên sau.
  speakerDiarization: boolean;
  speakerNames: boolean;
  // Gõ dịch (spec 2026-10-17-go-dich §1.4): bật/tắt (tắt thì gỡ phím tắt), ngôn ngữ đích, tự dán (chỉ có tác dụng trên macOS).
  compose: { enabled: boolean; target: ComposeTarget; autoPaste: boolean };
  modelTier: ModelTier | null;
  hotkeys: Record<HotkeyAction, string>;
  saveHistory: boolean;
  // Gửi báo cáo lỗi tự động cho nhà phát triển (spec 2026-10-17 §5). Cài mới: `false` cho tới khi qua bước Điều khoản (ô tích sẵn);
  // người dùng đã cài từ trước: `true` sau khi cập nhật. Bản debug vẫn không tự gửi trừ khi bật công tắc dev.
  sendErrorReports: boolean;
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
export type SettingsPatch = Partial<
  Omit<Settings, "hotkeys" | "overlay" | "experimental" | "compose" | "revision" | "modelTier">
> & {
  overlay?: Partial<Omit<Settings["overlay"], "locked" | "positions" | "lastMonitor">>;
  experimental?: Partial<Settings["experimental"]>;
  compose?: Partial<Settings["compose"]>;
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
  // Phiên này dịch sau mỗi câu vì máy chưa đủ nhanh: bị tắt từ đầu hay vừa tự tắt (spec 2026-10-10 §5, §6.3).
  streamingUnavailable: boolean;
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
  // Máy chưa đủ nhanh cho chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5, §6.3): bị tắt từ đầu, hay phiên
  // hiện tại hoặc phiên gần nhất tự tắt. Còn sau khi dừng, tới lần bắt đầu phiên sau. Cài đặt › Phụ đề ghi chú.
  streamingTooSlow: boolean;
  // macOS: âm thanh vào toàn im lặng tuyệt đối trong khi có app đang phát: nghi chưa được cấp quyền (§9).
  permissionSuspected: boolean;
  // macOS, nguồn một app: app đã chọn không phát tiếng nữa; phiên vẫn chạy, đang chờ app phát lại.
  waitingForApp: boolean;
  // Micro trả toàn số 0 từ đầu phiên (spec 2026-10-24-nguon-micro §7): thiếu quyền hay micro đang tắt tiếng.
  micIssue: MicIssue | null;
  // Đang có gói trả phí còn hạn: tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) mở; không thì khóa.
  pro: boolean;
  // Hạn mức còn từ 5 phút trở xuống (§4.2 bước 2): nhắc trên thanh phụ đề và cửa sổ chính.
  quotaWarning: boolean;
  // Thời điểm hạn mức được reset (giây Unix); `null` khi không giới hạn.
  quotaResetAt: number | null;
  // Phiên bản app mới đã tải xong, cài ở lần thoát kế tiếp (kế hoạch 07b); `null` khi chưa có.
  updateReady: string | null;
  // Cập nhật xong macOS sẽ hỏi lại mật khẩu Keychain và quyền thu âm (bản ký ad-hoc): lời mời cập nhật báo trước.
  updateReprompts: boolean;
  updateCheck: UpdateCheck;
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
  // Bản này có "Phân biệt người nói" không (`speaker::enabled()`; bản phát hành: theo bảng hệ điều hành): chỉ khi có và manifest có mục `speaker` mới hiện nhóm
  // Cài đặt "Người nói" (QĐ 9 của kế hoạch 03 phân biệt người nói).
  speakerAvailable: boolean;
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
  // Công tắc "Dịch trong lúc người nói chưa dừng": cùng `AppStatus.streamingTooSlow`, thanh phụ đề biết chế độ có hiệu lực
  // không (spec 2026-10-10 §6.1).
  translateWhileSpeaking: boolean;
}

// Phần cài đặt của ô soạn Gõ dịch (`compose::ComposeView`, spec 2026-10-17-go-dich §1.2, §1.4), gửi kèm mỗi lần mở.
export interface ComposeView {
  uiLanguage: UiLanguage;
  theme: Theme;
  // Ngôn ngữ đang dịch sang, đã tính "Tự động".
  target: Lang;
  // Enter tự dán (Windows luôn; macOS theo cài đặt) hay chỉ chép.
  autoPaste: boolean;
  // Bản quyền đang chặn Gõ dịch: mã lỗi (`error.<mã>`); `null` là dùng được.
  blocked: string | null;
  platform: "macos" | "windows";
}

// Kết quả của một yêu cầu dịch (`compose::Outcome`).
export type ComposeOutcome =
  | { kind: "translated"; text: string }
  // Chữ gõ đã là ngôn ngữ đích: không dịch, Enter dán nguyên văn.
  | { kind: "sameLanguage" }
  | { kind: "failed"; code: string };

export interface ComposeDone {
  id: number;
  outcome: ComposeOutcome;
}

// Phần chữ dịch mới của dòng `line` (đánh số theo mọi dòng của chữ đã gửi, kể cả dòng trống); `reset`: bỏ phần đã hiện.
export interface ComposeDelta {
  id: number;
  line: number;
  text: string;
  reset: boolean;
}

// Kết quả của lệnh dán (`compose::Submitted`): đã dán; đã chép (người dùng tự dán); macOS chưa có quyền Trợ năng (đã chép, ô
// soạn còn mở để hiện hộp quyền).
export type ComposeSubmitted = "pasted" | "copied" | "needsPermission";
// Màn hình của cửa sổ chính mà nút của hộp lỗi mở (`compose::MainScreen`).
export type ComposeMainScreen = "models" | "upgrade" | "license" | "home";

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
  // Mã giọng (spec 2026-10-26-phan-biet-nguoi-noi §9): `null` khi chưa xác định hay phiên không có nhận giọng. Nhãn, màu ở
  // `speaker://roster`.
  speaker: number | null;
}

// Phần chữ dịch mới trong lúc đang dịch: nối vào `tgt_text` của phụ đề cùng `id`.
export interface SubtitleDelta {
  id: number;
  text: string;
}

// Dòng đang nói (spec 2026-10-10 §6.1–§6.2, `pipeline::subtitle::LiveLine`): chỉ thanh phụ đề nhận (QĐ5). Câu gốc và bản
// dịch đều chia hai tầng: phần ổn định (`*_stable`) và phần tạm (`*_tail`, tự mang khoảng trắng đầu khi cần). `id` là id
// mà đoạn sẽ nhận khi đóng (cùng không gian id với `Subtitle`); `extends` là id của phụ đề tạm mà dòng này nối tiếp: dòng
// hiện thay chỗ phụ đề đó.
export interface LiveLine {
  id: number;
  extends: number | null;
  src_lang: string;
  src_stable: string;
  src_tail: string;
  tgt_stable: string;
  tgt_tail: string;
  // Chỉ để đo (spec 2026-10-10 §10.1); giao diện bỏ qua.
  tgt_src_units: number;
  // Giọng của câu mà dòng này nối tiếp (`extends`); lượt nói mới thì `null` tới khi đoạn đóng (spec 2026-10-26 §4.4).
  speaker: number | null;
}

// Gỡ dòng đang nói có `id` này.
export interface LiveEnd {
  id: number;
}

// Người nói (spec 2026-10-26-phan-biet-nguoi-noi §9; `transcript::speakers`). Tên từ đâu: đọc từ app họp, "Người N", người dùng đặt.
export type NameSource = "name" | "voice" | "user";

export interface SpeakerVoice {
  id: number;
  // Nhãn đã tính sẵn ở phía Rust: tên người dùng đặt, tên đọc từ app họp, hay "Người N" theo ngôn ngữ giao diện.
  label: string;
  // Chỉ số trong bảng 8 màu (0–7); mã màu theo nền ở CSS (`--spk-<n>`, `speakerColor` ở `speakers.ts`).
  color: number;
  source: NameSource;
  // Giọng trong phòng (nói vào micro).
  room: boolean;
  // Đã gộp tay vào giọng này: nhãn, màu là của giọng đó; tính như cùng một lượt nói.
  mergedInto: number | null;
}

// Bảng người nói của phiên (`speaker://roster`, kết quả của `rename_speaker`, `merge_speakers`).
export interface SpeakerRoster {
  voices: SpeakerVoice[];
  // Tên người tham dự đọc được (kế hoạch 04), cho "Chọn người trong cuộc họp".
  participants: string[];
  // Hiện dòng mời cấp quyền Trợ năng trên thanh phụ đề (spec §6.7; kế hoạch 04 bật).
  askAccess: boolean;
  // Số thứ tự của bảng (QĐ 25 của kế hoạch 03): tăng dần; bảng có `rev` nhỏ hơn bảng đã nhận là cũ, bỏ.
  rev: number;
}

// Giọng của một phụ đề đã phát vừa đổi (`subtitle://speaker`): nhãn tới muộn, gộp giọng.
export interface SpeakerLabel {
  id: number;
  speaker: number | null;
}

// Bản chép lời của một phiên (`transcript::store::Transcript`). `startedAt`, `endedAt`: giờ Unix (ms); `start_ms`,
// `end_ms` của từng dòng tính từ `startedAt`. `session` là 0 với phiên đọc từ lịch sử.
export interface Transcript {
  session: number;
  startedAt: number;
  endedAt: number | null;
  targetLang: string;
  lines: Subtitle[];
  // Người nói của phiên: `lines[i].speaker` là `id` trong danh sách này; Lịch sử: dựng lại từ nhãn đã lưu (chỉ đọc).
  speakers: SpeakerVoice[];
  // `rev` của bảng người nói lúc chụp: bản chụp tới muộn không đè bảng mới hơn (QĐ 25). Lịch sử: 0.
  speakersRev: number;
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

// "support": màn hình Hỗ trợ (chat, spec 2026-10-22-chat-ho-tro-zalo §4), giữa Nâng cấp và Giới thiệu.
export type Screen = "home" | "transcript" | "history" | "glossary" | "settings" | "upgrade" | "support" | "about";
// "compose": nhóm Cài đặt "Gõ dịch" (spec 2026-10-17-go-dich §1.4).
export type SettingsGroup =
  | "general"
  | "subtitles"
  | "compose"
  | "audio"
  | "model"
  | "hotkeys"
  | "license"
  | "privacy";

export interface Navigate {
  screen: Screen;
  settingsGroup: SettingsGroup | null;
  // Phần cần cuộn tới: nhóm Người nói ở Cài đặt › Phụ đề (nút "Mở Cài đặt" của dòng mời trên thanh phụ đề).
  focus?: "speakers";
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
// Free dùng thử 10 ngày và ba gói trả phí theo thời hạn (spec 2026-10-07 §1; `six_months` thêm ở spec 2026-10-13).
export type LicensePlan = "free" | "monthly" | "six_months" | "yearly";
export type Standing =
  | "free"
  | "active"
  | "expired"
  | "revoked"
  | "refreshNeeded"
  | "clockRolledBack"
  | "unverified"
  | "notGenuine"
  // Key đang kích hoạt trên 2 máy: tạm khóa tới khi một máy gỡ key (spec 2026-10-07 §4.2).
  | "conflict";

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

// Dùng thử của Free trên máy này (`license::manager::TrialView`).
export interface TrialView {
  status: "none" | "active" | "ended";
  endsAt: number | null;
  daysLeft: number;
}

// Trạng thái xung đột (`license::manager::ConflictView`): các máy đang kích hoạt key, và activation của máy này.
export interface ConflictView {
  devices: Device[];
  thisActivationId: string;
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
  trial: TrialView;
  conflict: ConflictView | null;
}

// Một máy đang kích hoạt, trong `409 key_in_use` hay `409 license_conflict` (`license::client::Device`). `device_label`
// có thể là `null`.
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

// Bảng gói đang bán (`license::purchase::PlansView`). Giá tính theo đơn vị nhỏ nhất của từng loại tiền: đồng (VND), cent (USD).
export interface PlansView {
  plans: PlanOffer[];
}

export interface CheckoutView {
  orderCode: number;
  plan: string;
  amount: number;
  currency: string;
  expiresAt: number;
  // Cổng thanh toán của đơn: "payos" (VietQR) hay "creem" (thẻ quốc tế).
  provider: string;
  // Mã VietQR đã vẽ (SVG, do phía Rust vẽ). `null` với đơn không có mã QR (thẻ): khách trả ở trang thanh toán mở bằng trình duyệt.
  qrSvg: string | null;
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

// Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4; `support::api::SupportMessage`, `support::chat::SupportView`). Phía Rust giữ
// token và nhịp hỏi tin mới; giao diện chỉ nhận trạng thái này, không có token.
export interface SupportMessage {
  id: number;
  sender: "customer" | "owner";
  text: string;
  // Giây Unix.
  createdAt: number;
}

export interface SupportView {
  // Chat đang bật trên server. Chưa biết (chưa có cuộc chat: app không hỏi server khi chưa nhắn) thì `true`, để hiện ô nhập.
  enabled: boolean;
  // Chủ dự án đã chặn cuộc chat này.
  closed: boolean;
  // Đã có cuộc chat: ô "Gửi kèm thông tin máy" chỉ hiện khi chưa có.
  hasConversation: boolean;
  // Các tin đã biết, `id` tăng dần.
  messages: SupportMessage[];
  // Có câu trả lời mới chưa xem: chấm đỏ ở mục Hỗ trợ.
  unread: boolean;
  // Tăng mỗi lần trạng thái đổi: bản có `rev` nhỏ hơn bản đang có là cũ, bỏ qua.
  rev: number;
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
  // Nguồn micro (spec 2026-10-24-nguon-micro §4): danh sách micro, quyền micro, trang quyền micro của hệ điều hành.
  list_input_devices: { args: undefined; result: InputDevice[] };
  get_mic_permission: { args: undefined; result: MicPermission };
  request_mic_permission: { args: undefined; result: MicPermission };
  open_mic_settings: { args: undefined; result: null };
  // Cài đặt › Gõ dịch (macOS): đã có quyền Trợ năng chưa (Windows luôn `true`); mở trang Trợ năng của System Settings.
  get_accessibility_trusted: { args: undefined; result: boolean };
  open_accessibility_settings: { args: undefined; result: null };
  // Bước "Nghe thử": phiên thu toàn hệ thống, kể cả âm thanh của chính app. Dừng bằng `toggle_session`.
  start_listen_test: { args: undefined; result: AppStatus };
  get_transcript: { args: undefined; result: Transcript };
  // `utcOffsetMinutes`: độ lệch múi giờ của máy (phút, dương ở phía đông), để ghi giờ địa phương.
  transcript_text: { args: { source: TranscriptRef; utcOffsetMinutes: number }; result: string };
  // Pro. Trả đường dẫn đã ghi, `null` nếu người dùng bấm Hủy ở hộp thoại lưu.
  export_transcript: {
    args: { source: TranscriptRef; format: ExportFormat; srtText: SrtText; utcOffsetMinutes: number; srtSpeakers?: boolean };
    result: string | null;
  };
  list_history: { args: undefined; result: SessionSummary[] };
  get_history_session: { args: { id: number }; result: Transcript };
  delete_history_session: { args: { id: number }; result: null };
  clear_history: { args: undefined; result: number };
  // Người nói (spec 2026-10-26-phan-biet-nguoi-noi §8.2): đổi tên (≤ 40 ký tự; rỗng là trở về tên tự động), gộp, trong phiên đang
  // chạy. Lỗi `speakerNotFound` khi phiên đã dừng hay giọng không còn; đổi tên: `tooLong` (field `name`); gộp: `speakerSame` khi gộp
  // một giọng vào chính nó hay vào giọng nó đã được gộp vào.
  rename_speaker: { args: { id: number; name: string }; result: SpeakerRoster };
  merge_speakers: { args: { from: number; into: number }; result: SpeakerRoster };
  // Chỉ thanh phụ đề: nút "Mở Cài đặt" của dòng mời cấp quyền; mở Cài đặt › Phụ đề › Người nói.
  open_speaker_settings: { args: undefined; result: null };
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
  // `allowConflict`: người dùng đã xác nhận "Vẫn kích hoạt trên máy này" (spec 2026-10-07 §4.2).
  activate_license: { args: { key: string; allowConflict?: boolean }; result: ActivateOutcome };
  deactivate_license: { args: undefined; result: LicenseView | null };
  // Không có `key`: dùng key đã lưu (đang xung đột, "Gỡ máy kia"); phía Rust `validate` ngay sau đó.
  deactivate_other_device: { args: { key?: string; activationId: string }; result: null };
  // Bước Điều khoản vừa được đồng ý: đăng ký dùng thử chạy nền (spec 2026-10-07 §3.2).
  start_trial: { args: undefined; result: null };
  validate_license: { args: undefined; result: LicenseView | null };
  get_plans: { args: undefined; result: PlansView };
  start_checkout: {
    args: { plan: string; email: string; consent: boolean; renew: boolean; currency: string };
    result: CheckoutView;
  };
  get_pending_order: { args: undefined; result: CheckoutView | null };
  cancel_checkout: { args: undefined; result: null };
  open_checkout_page: { args: undefined; result: null };
  recover_license: { args: { email: string }; result: null };
  check_for_updates: { args: undefined; result: AppStatus };
  restart_to_update: { args: undefined; result: null };
  // Nút "Gửi log cho hỗ trợ" ở Giới thiệu (spec 2026-10-17 §1, §5): dựng và gửi báo cáo ngay, kể cả khi tắt báo cáo tự động. Trả mã
  // báo cáo để người dùng đọc cho hỗ trợ. Lỗi: `reportFailed` (mạng hỏng), `reportRateLimited` (gửi quá nhiều), `reportRejected`.
  send_log_report: { args: undefined; result: { id: string } };
  // Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4), chỉ cửa sổ chính. `support_screen`: màn hình Hỗ trợ mở hay đóng (lúc mở
  // cửa sổ gọi với `false` để có chấm đỏ), không gọi mạng. Lúc mở màn hình: `support_fetch` (cả cuộc chat) chỉ khi đã có cuộc chat;
  // chưa từng nhắn thì không gọi mạng. Lỗi: `supportOffline`, `supportRateLimited`, `supportBusy`, `supportDisabled`,
  // `supportClosed`, `supportExpired`, `supportInvalid` (kèm `field`).
  support_screen: { args: { open: boolean }; result: SupportView };
  support_fetch: { args: undefined; result: SupportView };
  // `withMachineInfo`: ô "Gửi kèm thông tin máy" đang tích; chỉ có tác dụng ở tin đầu tiên của cuộc chat.
  support_send: { args: { text: string; withMachineInfo: boolean }; result: SupportView };
  // `null`: bỏ email đã để lại.
  support_set_email: { args: { email: string | null }; result: null };
  support_delete: { args: undefined; result: SupportView };
  // Dòng thông tin máy gửi kèm tin đầu tiên (không có key, email, mã máy, tên máy, tên người dùng), hiện nguyên văn cạnh ô tích.
  support_machine_info: { args: undefined; result: string };
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
  // Ô soạn Gõ dịch (spec 2026-10-17-go-dich §3.6), chỉ cửa sổ `compose` gọi được. `compose_translate` trả số của yêu cầu, kết
  // quả tới qua `compose://delta` và `compose://done`; `compose_submit` dán kết quả đã lưu của đúng yêu cầu đó (không nhận chữ).
  get_compose_view: { args: undefined; result: ComposeView };
  compose_translate: { args: { text: string }; result: number };
  compose_submit: { args: { id: number }; result: ComposeSubmitted };
  compose_close: { args: undefined; result: null };
  compose_resize: { args: { height: number }; result: null };
  compose_open_accessibility: { args: undefined; result: null };
  compose_copy_only: { args: undefined; result: null };
  compose_open_main: { args: { screen: ComposeMainScreen }; result: null };
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
  // Dòng đang nói và lệnh gỡ nó (spec 2026-10-10 §6.2): chỉ tới thanh phụ đề; cửa sổ chính không nghe (QĐ5).
  "subtitle://live": LiveLine;
  "subtitle://live-end": LiveEnd;
  // Người nói (spec 2026-10-26-phan-biet-nguoi-noi §4.3, §9): tới cả cửa sổ chính lẫn thanh phụ đề.
  "subtitle://speaker": SpeakerLabel;
  "speaker://roster": SpeakerRoster;
  // Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch; tới cả cửa sổ chính lẫn thanh phụ đề.
  "audio://level": number;
  // Trạng thái quản lý model (kế hoạch 04).
  "models://state": ModelsView;
  // Ô soạn Gõ dịch: mở (kèm phần cài đặt của nó), yêu cầu đang chờ nạp model, phần chữ dịch mới, kết quả.
  "compose://open": ComposeView;
  "compose://loading": { id: number };
  "compose://delta": ComposeDelta;
  "compose://done": ComposeDone;
  // Chat hỗ trợ: trạng thái mới sau lần hỏi tin nền (tin mới, chấm đỏ, chat tắt, cuộc chat không còn).
  "support://view": SupportView;
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
