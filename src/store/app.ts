import { createStore } from "zustand/vanilla";
import type {
  AppInfo,
  AppNotice,
  AppStatus,
  CommandError,
  HotkeyAction,
  Ipc,
  Lang,
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

export interface AppStoreState {
  settings: Settings | null;
  status: AppStatus | null;
  info: AppInfo | null;
  screen: Screen;
  settingsGroup: SettingsGroup;
  onboardingStep: number;
  error: UiError | null;
  notice: AppNotice | null;
  // Lệnh Bắt đầu/Dừng đang chờ phía Rust trả lời: nút bị khóa, bấm thêm không gửi lệnh thứ hai.
  sessionPending: boolean;
  init(): Promise<() => void>;
  navigate(screen: Screen, settingsGroup?: SettingsGroup | null): void;
  setOnboardingStep(step: number): void;
  updateSettings(patch: SettingsPatch): Promise<boolean>;
  setSourceLanguage(lang: Lang, on: boolean): Promise<void>;
  setHotkey(action: HotkeyAction, accelerator: string): Promise<UiError | null>;
  toggleSession(): Promise<void>;
  setOverlayVisible(visible: boolean): Promise<void>;
  setOverlayLocked(locked: boolean): Promise<void>;
  openLogDir(): Promise<void>;
  openTaskbarSettings(): Promise<void>;
  openLoginItemsSettings(): Promise<void>;
  finishOnboarding(): Promise<void>;
  dismissError(): void;
  dismissNotice(): void;
}

// Đã xong các bước lần đầu mở chưa. Chưa xong thì `App` chỉ hiện `Onboarding`, nên đổi `screen` không có
// tác dụng gì; nút đưa tới một màn hình (ví dụ "Mở cài đặt" ở thanh báo phím tắt lỗi) phải ẩn đi.
export function canOpenScreens(state: Pick<AppStoreState, "settings">): boolean {
  return state.settings?.onboardingDone === true;
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

    return {
      settings: null,
      status: null,
      info: null,
      screen: "home",
      settingsGroup: "general",
      onboardingStep: 0,
      error: null,
      notice: null,
      sessionPending: false,

      // Lỗi ở bất kỳ bước nào thì gỡ các listener đã đăng ký rồi ném lỗi tiếp cho bên gọi (`main.tsx` hiện câu báo).
      async init() {
        const listening = await Promise.allSettled([
          ipc.listen("settings://changed", (settings) => set({ settings })),
          ipc.listen("app://status", (status) => set({ status })),
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
          set({ settings, status, info });
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

      updateSettings(patch) {
        return run(
          () => ipc.invoke("update_settings", { patch }),
          (settings) => set({ settings }),
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
          set({ settings: await ipc.invoke("set_hotkey", { action, accelerator }) });
          return null;
        } catch (e) {
          return toUiError(e);
        }
      },

      async toggleSession() {
        if (get().sessionPending) return;
        set({ sessionPending: true });
        try {
          await run(
            () => ipc.invoke("toggle_session"),
            (status) => set({ status }),
          );
        } finally {
          set({ sessionPending: false });
        }
      },

      async setOverlayVisible(visible) {
        await run(
          () => ipc.invoke("set_overlay_visible", { visible }),
          (status) => set({ status }),
        );
      },

      async setOverlayLocked(locked) {
        await run(
          () => ipc.invoke("set_overlay_locked", { locked }),
          (settings) => set({ settings }),
        );
      },

      async openLogDir() {
        await run(
          () => ipc.invoke("open_log_dir"),
          () => {},
        );
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

      async finishOnboarding() {
        if (await get().updateSettings({ onboardingDone: true })) set({ screen: "home" });
      },

      dismissError() {
        set({ error: null });
      },

      dismissNotice() {
        set({ notice: null });
      },
    };
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
