import { createStore } from "zustand/vanilla";
import type {
  AppInfo,
  AppNotice,
  AppStatus,
  AudioSourceOption,
  CommandError,
  DebugSession,
  HotkeyAction,
  InputDevice,
  Ipc,
  Lang,
  MicPermission,
  Navigate,
  Screen,
  Settings,
  SettingsGroup,
  SettingsPatch,
} from "../lib/ipc";
import { LANGS } from "../lib/ipc";

// Store của cửa sổ chính (spec §6.10): giữ bản sao cài đặt và trạng thái do phía Rust gửi sang,
// nhận sự kiện để luôn khớp với menu khay và phím tắt. Mọi thay đổi đi qua lệnh `invoke`; store chỉ
// cập nhật theo kết quả phía Rust trả về, không tự đoán.

export interface UiError {
  code: string;
  field: string | null;
}

// Kết quả nút "Gửi log cho hỗ trợ" ở Giới thiệu (spec 2026-10-17 §5). Lỗi nằm ngay trong trạng thái, không lên thanh báo lỗi
// chung: Giới thiệu hiện câu lỗi dưới nút.
export type LogReportState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; id: string }
  | { status: "failed"; code: string };

// Mức âm lượng (RMS 0–1) ra độ dài thanh đo 0–1, theo dBFS từ −60 dB tới 0 dB: tiếng nói bình thường (−30 tới −10 dBFS)
// nằm giữa thanh, thay vì dồn sát đầu như khi vẽ thẳng RMS.
export function levelToMeter(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db + 60) / 60));
}

export interface AppStoreState {
  settings: Settings | null;
  status: AppStatus | null;
  info: AppInfo | null;
  screen: Screen;
  settingsGroup: SettingsGroup;
  onboardingStep: number;
  // Đã tick đồng ý EULA và chính sách ở bước Điều khoản; chỉ trong phiên onboarding, không ghi xuống đĩa.
  termsAccepted: boolean;
  // Ô "Tự động gửi báo cáo lỗi" ở bước Điều khoản (spec 2026-10-17 §5): tích sẵn; chỉ trong phiên onboarding, lưu vào cài đặt
  // (`sendErrorReports`) khi bấm Tiếp (`saveErrorReportsConsent`).
  errorReportsConsent: boolean;
  logReport: LogReportState;
  error: UiError | null;
  notice: AppNotice | null;
  // Lệnh Bắt đầu/Dừng đang chờ phía Rust trả lời: nút bị khóa, bấm thêm không gửi lệnh thứ hai.
  sessionPending: boolean;
  // Mức âm lượng vào gần nhất (RMS), 0 khi không dịch.
  level: number;
  // Nguồn chọn được ở Cài đặt › Âm thanh; `null` là chưa đọc.
  audioSources: AudioSourceOption[] | null;
  // Micro chọn được ở Cài đặt › Âm thanh (spec 2026-10-24-nguon-micro §3.2); `null` là chưa đọc.
  inputDevices: InputDevice[] | null;
  // Quyền micro; `null` là chưa đọc.
  micPermission: MicPermission | null;
  // Số đo của các phiên gần nhất cho bảng debug ẩn (§7); `null` là chưa đọc.
  debugSessions: DebugSession[] | null;
  // Vừa xóa xong toàn bộ dữ liệu (Cài đặt › Quyền riêng tư), để báo lại.
  dataCleared: boolean;
  // Phiên bản cập nhật mà người dùng đã bấm "Để sau" (chỉ trong lần chạy này; menu khay vẫn còn mục khởi động lại).
  updateDismissed: string | null;
  // macOS: đã có quyền Trợ năng chưa (Cài đặt › Gõ dịch, spec 2026-10-17-go-dich §1.4); `null` là chưa đọc.
  accessibilityTrusted: boolean | null;
  init(): Promise<() => void>;
  navigate(screen: Screen, settingsGroup?: SettingsGroup | null): void;
  setOnboardingStep(step: number): void;
  setTermsAccepted(accepted: boolean): void;
  setErrorReportsConsent(consent: boolean): void;
  // Qua bước Điều khoản: lưu lựa chọn của ô tích vào cài đặt. Lỗi hiện ở thanh báo lỗi và không chặn các bước (chưa lưu được thì
  // cài đặt giữ `false`: không gửi gì).
  saveErrorReportsConsent(): Promise<void>;
  updateSettings(patch: SettingsPatch): Promise<boolean>;
  setSourceLanguage(lang: Lang, on: boolean): Promise<void>;
  setHotkey(action: HotkeyAction, accelerator: string): Promise<UiError | null>;
  toggleSession(): Promise<void>;
  setOverlayVisible(visible: boolean): Promise<void>;
  setOverlayLocked(locked: boolean): Promise<void>;
  openLogDir(): Promise<void>;
  // Gửi báo cáo lỗi ngay (kể cả khi tắt tự động); chặn bấm đúp. Kết quả ở `logReport`.
  sendLogReport(): Promise<void>;
  dismissLogReport(): void;
  openTaskbarSettings(): Promise<void>;
  openLoginItemsSettings(): Promise<void>;
  openAudioPermissionSettings(): Promise<void>;
  // Đọc lại quyền Trợ năng (lúc mở nhóm Cài đặt "Gõ dịch" và mỗi khi cửa sổ được focus lại). Lặng lẽ: lỗi thì giữ trạng thái cũ.
  loadAccessibility(): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  loadAudioSources(): Promise<void>;
  loadInputDevices(): Promise<void>;
  // Đọc quyền micro (lúc chọn hay mở chế độ Micro). Lặng lẽ: lỗi thì giữ trạng thái cũ.
  loadMicPermission(): Promise<void>;
  // Hỏi quyền micro (spec 2026-10-24-nguon-micro §3.4): lúc chọn chế độ có micro, khi quyền chưa hỏi.
  requestMicPermission(): Promise<void>;
  openMicSettings(): Promise<void>;
  // Màn hình chính: đọc danh sách nguồn một lần mỗi lần mở app, chỉ để có tên hiển thị của nguồn đang chọn (tên app,
  // tên thiết bị). Lặng lẽ: lỗi không hiện ở thanh báo lỗi, thành công không xóa lỗi đang hiện.
  loadAudioSourceNames(): Promise<void>;
  // Như `loadAudioSourceNames`, cho tên micro của màn hình chính (chế độ có micro). Lặng lẽ: lỗi không hiện ở thanh báo lỗi,
  // thành công không xóa lỗi đang hiện; Cài đặt › Âm thanh dùng `loadInputDevices` và báo lỗi như cũ.
  loadInputDeviceNames(): Promise<void>;
  finishOnboarding(): Promise<void>;
  // Qua bước Điều khoản (đã đồng ý): đăng ký dùng thử chạy nền (spec 2026-10-07 §3.2). Lỗi không chặn các bước.
  startTrial(): Promise<void>;
  // Bước "Nghe thử" (§4.1 bước 6): bắt đầu phiên thu toàn hệ thống, kể cả âm thanh của chính app.
  startListenTest(): Promise<void>;
  clearAllData(): Promise<void>;
  loadDebugSessions(): Promise<void>;
  dismissError(): void;
  dismissNotice(): void;
  // "Kiểm tra cập nhật" ở Cài đặt › Chung: kiểm ngay, tải nếu có bản mới. Tiến trình và kết quả ở `status.updateCheck`.
  checkForUpdates(): Promise<void>;
  // Khởi động lại để cài bản cập nhật đã tải (kế hoạch 07b). Lỗi (đang dịch, đang tải model) hiện ở thanh báo lỗi.
  restartToUpdate(): Promise<void>;
  dismissUpdate(): void;
}

// Đã xong các bước lần đầu mở chưa. Chưa xong thì `App` chỉ hiện `Onboarding`, nên đổi `screen` không có
// tác dụng gì; nút đưa tới một màn hình (ví dụ "Mở cài đặt" ở thanh báo phím tắt lỗi) phải ẩn đi.
export function canOpenScreens(state: Pick<AppStoreState, "settings">): boolean {
  return state.settings?.onboardingDone === true;
}

// Phiên bản để mời khởi động lại cập nhật (§6.11, Q13): có bản đã tải, app rảnh (không đang bắt đầu hay đang dịch), và
// người dùng chưa bấm "Để sau" cho đúng bản đó. Đang dịch thì không mời; dừng dịch thì lời mời hiện lại.
export function updateInvite(state: Pick<AppStoreState, "status" | "updateDismissed">): string | null {
  const status = state.status;
  if (!status?.updateReady) return null;
  if (status.session === "starting" || status.session === "running") return null;
  return state.updateDismissed === status.updateReady ? null : status.updateReady;
}

// Lời mời cập nhật có báo trước macOS sẽ hỏi lại mật khẩu Keychain và quyền thu âm không (bản ký ad-hoc).
export function updateReprompts(state: Pick<AppStoreState, "status">): boolean {
  return state.status?.updateReprompts === true;
}

// Lỗi từ `invoke`: `CommandError` của app, hoặc chuỗi lỗi của Tauri (sai tham số, bị ACL chặn).
export function toUiError(e: unknown): UiError {
  if (typeof e === "object" && e !== null && typeof (e as CommandError).code === "string") {
    const { code, field } = e as CommandError;
    return { code, field: field ?? null };
  }
  return { code: "unknown", field: null };
}

export function createAppStore(ipc: Ipc) {
  return createStore<AppStoreState>()((set, get) => {
    // Chạy một lệnh; lỗi thì hiện ở thanh báo lỗi của cửa sổ chính, lệnh sau thành công thì lỗi cũ tự mất.
    async function run<T>(call: () => Promise<T>, apply: (result: T) => void): Promise<boolean> {
      try {
        apply(await call());
        set({ error: null });
        return true;
      } catch (e) {
        set({ error: toUiError(e) });
        return false;
      }
    }

    // Nhận một trạng thái mới, từ sự kiện `app://status` hay kết quả của một lệnh. Kết quả của lệnh có thể tới sau một
    // sự kiện mới hơn: trạng thái có `rev` nhỏ hơn trạng thái đang có thì bỏ. Phiên không chạy thì mức âm lượng về 0.
    function setStatus(status: AppStatus) {
      const current = get().status;
      if (current && status.rev < current.rev) return;
      set(status.session === "running" ? { status } : { status, level: 0 });
    }

    // Nhận một bản cài đặt mới, từ sự kiện `settings://changed` hay kết quả của một lệnh. Kết quả của lệnh có thể tới sau
    // một sự kiện mới hơn: bản có `revision` nhỏ hơn bản đang có thì bỏ (bằng nhau thì nhận, vì là cùng một bản).
    function setSettings(settings: Settings) {
      const current = get().settings;
      if (current && settings.revision < current.revision) return;
      set({ settings });
    }

    // `loadAudioSourceNames` đã gửi lệnh trong lần mở app này chưa.
    let sourceNamesRequested = false;
    // `loadInputDeviceNames` đã gửi lệnh trong lần mở app này chưa.
    let inputNamesRequested = false;

    return {
      settings: null,
      status: null,
      info: null,
      screen: "home",
      settingsGroup: "general",
      onboardingStep: 0,
      termsAccepted: false,
      errorReportsConsent: true,
      logReport: { status: "idle" },
      error: null,
      notice: null,
      sessionPending: false,
      level: 0,
      audioSources: null,
      inputDevices: null,
      micPermission: null,
      debugSessions: null,
      dataCleared: false,
      updateDismissed: null,
      accessibilityTrusted: null,

      // Lỗi ở bất kỳ bước nào thì gỡ các listener đã đăng ký rồi ném lỗi tiếp cho bên gọi (`main.tsx` hiện câu báo).
      async init() {
        const listening = await Promise.allSettled([
          ipc.listen("settings://changed", (settings) => setSettings(settings)),
          ipc.listen("app://status", (status) => setStatus(status)),
          ipc.listen("audio://level", (level) => set({ level })),
          ipc.listen("app://navigate", (target: Navigate) => get().navigate(target.screen, target.settingsGroup)),
          ipc.listen("app://notice", (notice) => set({ notice })),
        ]);
        const offs = listening.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
        const off = () => offs.forEach((f) => f());
        try {
          const failed = listening.find((r) => r.status === "rejected");
          if (failed) throw failed.reason;
          const [settings, status, info] = await Promise.all([
            ipc.invoke("get_settings"),
            ipc.invoke("get_app_status"),
            ipc.invoke("get_app_info"),
          ]);
          // Cài đặt đã tới qua sự kiện trong lúc chờ `get_settings` thì chỉ thay khi kết quả của lệnh mới hơn hẳn: cùng số
          // thứ tự là cùng một bản, giữ bản của sự kiện.
          const current = get().settings;
          if (!current || settings.revision > current.revision) set({ settings });
          set({ info });
          setStatus(status);
        } catch (e) {
          off();
          throw e;
        }
        return off;
      },

      navigate(screen, settingsGroup) {
        set(settingsGroup ? { screen, settingsGroup } : { screen });
      },

      setOnboardingStep(onboardingStep) {
        set({ onboardingStep });
      },

      setTermsAccepted(termsAccepted) {
        set({ termsAccepted });
      },

      setErrorReportsConsent(errorReportsConsent) {
        set({ errorReportsConsent });
      },

      async saveErrorReportsConsent() {
        await get().updateSettings({ sendErrorReports: get().errorReportsConsent });
      },

      updateSettings(patch) {
        return run(
          () => ipc.invoke("update_settings", { patch }),
          (settings) => setSettings(settings),
        );
      },

      // Tập nguồn mới tính từ cài đặt đang có trong store lúc bấm (không từ bản giao diện vẽ lần trước), giữ thứ tự
      // của `LANGS`. Không bỏ chọn ngôn ngữ cuối cùng (phía Rust cũng từ chối tập rỗng).
      async setSourceLanguage(lang, on) {
        const current = get().settings?.sourceLanguages;
        if (!current) return;
        const next = LANGS.filter((l) => (l === lang ? on : current.includes(l)));
        if (next.length === 0) return;
        await get().updateSettings({ sourceLanguages: next });
      },

      async setHotkey(action, accelerator) {
        try {
          setSettings(await ipc.invoke("set_hotkey", { action, accelerator }));
          return null;
        } catch (e) {
          return toUiError(e);
        }
      },

      // Lỗi bắt đầu phiên nằm trong trạng thái (`session` "error", `sessionError`), Home hiện ngay dưới nút; chỉ lỗi
      // khác (ví dụ lệnh bị chặn) mới lên thanh báo lỗi chung.
      async toggleSession() {
        if (get().sessionPending) return;
        set({ sessionPending: true });
        try {
          setStatus(await ipc.invoke("toggle_session"));
          set({ error: null });
        } catch (e) {
          const status = await ipc.invoke("get_app_status").catch(() => null);
          if (status?.session === "error") {
            // Lỗi bắt đầu nằm trong trạng thái; thanh báo lỗi của lệnh trước không còn đúng (Nhỏ-8 của review 02 lần 3).
            setStatus(status);
            set({ error: null });
          } else set({ error: toUiError(e) });
        } finally {
          set({ sessionPending: false });
        }
      },

      async setOverlayVisible(visible) {
        await run(
          () => ipc.invoke("set_overlay_visible", { visible }),
          (status) => setStatus(status),
        );
      },

      async setOverlayLocked(locked) {
        await run(
          () => ipc.invoke("set_overlay_locked", { locked }),
          (settings) => setSettings(settings),
        );
      },

      async openLogDir() {
        await run(
          () => ipc.invoke("open_log_dir"),
          () => {},
        );
      },

      async sendLogReport() {
        if (get().logReport.status === "sending") return;
        set({ logReport: { status: "sending" } });
        try {
          const { id } = await ipc.invoke("send_log_report");
          set({ logReport: { status: "sent", id } });
        } catch (e) {
          set({ logReport: { status: "failed", code: toUiError(e).code } });
        }
      },

      dismissLogReport() {
        set({ logReport: { status: "idle" } });
      },

      async openTaskbarSettings() {
        await run(
          () => ipc.invoke("open_taskbar_settings"),
          () => {},
        );
      },

      // macOS: mở System Settings › Login Items từ lời nhắc `loginItemsApproval`, rồi đóng lời nhắc.
      async openLoginItemsSettings() {
        await run(
          () => ipc.invoke("open_login_items_settings"),
          () => set({ notice: null }),
        );
      },

      async openAudioPermissionSettings() {
        await run(
          () => ipc.invoke("open_audio_permission_settings"),
          () => {},
        );
      },

      async loadAccessibility() {
        try {
          set({ accessibilityTrusted: await ipc.invoke("get_accessibility_trusted") });
        } catch {
          // Giữ trạng thái cũ; nhóm Cài đặt vẫn có nút mở trang Trợ năng.
        }
      },

      async openAccessibilitySettings() {
        await run(
          () => ipc.invoke("open_accessibility_settings"),
          () => {},
        );
      },

      async loadAudioSourceNames() {
        if (sourceNamesRequested || get().audioSources !== null) return;
        sourceNamesRequested = true;
        try {
          const audioSources = await ipc.invoke("list_audio_sources");
          if (get().audioSources === null) set({ audioSources });
        } catch {
          // Không có tên thì màn hình chính hiện mã nguồn; Cài đặt › Âm thanh vẫn đọc lại và báo lỗi như cũ.
        }
      },

      async loadInputDeviceNames() {
        if (inputNamesRequested || get().inputDevices !== null) return;
        inputNamesRequested = true;
        try {
          const inputDevices = await ipc.invoke("list_input_devices");
          if (get().inputDevices === null) set({ inputDevices });
        } catch {
          // Không có tên thì màn hình chính hiện mã micro; Cài đặt › Âm thanh vẫn đọc lại và báo lỗi như cũ.
        }
      },

      async loadInputDevices() {
        await run(
          () => ipc.invoke("list_input_devices"),
          (inputDevices) => set({ inputDevices }),
        );
      },

      async loadMicPermission() {
        try {
          set({ micPermission: await ipc.invoke("get_mic_permission") });
        } catch {
          // Giữ trạng thái cũ; Cài đặt › Âm thanh vẫn có nút mở trang quyền micro.
        }
      },

      async requestMicPermission() {
        await run(
          () => ipc.invoke("request_mic_permission"),
          (micPermission) => set({ micPermission }),
        );
      },

      async openMicSettings() {
        await run(
          () => ipc.invoke("open_mic_settings"),
          () => {},
        );
      },

      async loadAudioSources() {
        await run(
          () => ipc.invoke("list_audio_sources"),
          (audioSources) => set({ audioSources }),
        );
      },

      async finishOnboarding() {
        if (await get().updateSettings({ onboardingDone: true })) set({ screen: "home" });
      },

      async startTrial() {
        await ipc.invoke("start_trial").catch(() => null);
      },

      // Như `toggleSession`: chặn bấm đúp; lỗi bắt đầu nằm trong trạng thái phiên.
      async startListenTest() {
        if (get().sessionPending) return;
        set({ sessionPending: true });
        try {
          setStatus(await ipc.invoke("start_listen_test"));
          set({ error: null });
        } catch (e) {
          const status = await ipc.invoke("get_app_status").catch(() => null);
          if (status?.session === "error") {
            setStatus(status);
            set({ error: null });
          } else set({ error: toUiError(e) });
        } finally {
          set({ sessionPending: false });
        }
      },

      async clearAllData() {
        set({ dataCleared: false });
        await run(
          () => ipc.invoke("clear_all_data"),
          () => set({ dataCleared: true }),
        );
      },

      async loadDebugSessions() {
        await run(
          () => ipc.invoke("get_debug_sessions"),
          (debugSessions) => set({ debugSessions }),
        );
      },

      dismissError() {
        set({ error: null });
      },

      dismissNotice() {
        set({ notice: null });
      },

      async checkForUpdates() {
        // Người dùng chủ động hỏi: lời mời khởi động lại hiện lại, kể cả khi đã bấm "Để sau" cho bản đó.
        set({ updateDismissed: null });
        await run(
          () => ipc.invoke("check_for_updates"),
          (status) => setStatus(status),
        );
      },

      async restartToUpdate() {
        await run(
          () => ipc.invoke("restart_to_update"),
          () => {},
        );
      },

      dismissUpdate() {
        set({ updateDismissed: get().status?.updateReady ?? null });
      },
    };
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
