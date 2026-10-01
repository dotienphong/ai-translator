import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { AppInfo, AppStatus, Settings } from "../lib/ipc";
import { canOpenScreens, createAppStore, toUiError } from "./app";

const settings: Settings = {
  uiLanguage: "vi",
  targetLanguage: "vi",
  sourceLanguages: ["en", "zh", "ja", "ko", "vi"],
  sourceLock: null,
  audioSource: { kind: "system" },
  vadEndSilenceMs: 300,
  overlay: { fontSize: 22, lines: 2, opacity: 0.6, showSource: false, locked: false, positions: {}, lastMonitor: null },
  modelTier: null,
  hotkeys: { toggleSession: "Ctrl+Alt+T", toggleOverlay: "Ctrl+Alt+H", toggleLock: "Ctrl+Alt+L" },
  saveHistory: false,
  launchAtLogin: false,
  theme: "system",
  updateChannel: "stable",
  experimental: { translationContext: false },
  onboardingDone: false,
};
const status: AppStatus = { session: "idle", overlayVisible: true, hotkeyFailures: [] };
const info: AppInfo = {
  name: "AI Translator",
  version: "0.1.0",
  identifier: "com.aitranslator.desktop",
  platform: "macos",
  launchedAtLogin: false,
};

let failToggle = false;

function setup() {
  failToggle = false;
  const fake = fakeIpc({
    get_settings: () => settings,
    get_app_status: () => status,
    get_app_info: () => info,
    update_settings: ({ patch }) => {
      if (patch.vadEndSilenceMs === 900) throw { code: "outOfRange", field: "vadEndSilenceMs", message: "…" };
      return { ...settings, ...patch } as Settings;
    },
    set_hotkey: ({ action, accelerator }) => {
      if (accelerator === "Ctrl+Alt+KeyH") throw { code: "hotkeyDuplicate", field: action, message: "…" };
      return { ...settings, hotkeys: { ...settings.hotkeys, [action]: accelerator.replace("Key", "") } };
    },
    toggle_session: () => {
      if (failToggle) throw { code: "overlayFailed", field: null, message: "…" };
      return { ...status, session: "running", overlayVisible: true };
    },
    set_overlay_locked: ({ locked }) => ({ ...settings, overlay: { ...settings.overlay, locked } }),
    open_login_items_settings: () => null,
  });
  return { fake, store: createAppStore(fake.ipc) };
}

describe("app store", () => {
  it("init đọc cài đặt, trạng thái, thông tin app và nghe bốn sự kiện", async () => {
    const { fake, store } = setup();
    const off = await store.getState().init();
    expect(store.getState().settings).toEqual(settings);
    expect(store.getState().status).toEqual(status);
    expect(store.getState().info?.platform).toBe("macos");
    expect(fake.listenerCount("settings://changed")).toBe(1);
    expect(fake.listenerCount("app://status")).toBe(1);
    expect(fake.listenerCount("app://navigate")).toBe(1);
    expect(fake.listenerCount("app://notice")).toBe(1);
    off();
    expect(fake.listenerCount("settings://changed")).toBe(0);
  });

  it("sự kiện từ phía Rust cập nhật store (khay, phím tắt đổi trạng thái)", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://status", { ...status, session: "running", hotkeyFailures: ["toggleLock"] });
    expect(store.getState().status?.session).toBe("running");
    expect(store.getState().status?.hotkeyFailures).toEqual(["toggleLock"]);
    fake.emit("settings://changed", { ...settings, uiLanguage: "en" });
    expect(store.getState().settings?.uiLanguage).toBe("en");
    fake.emit("app://navigate", { screen: "settings", settingsGroup: "hotkeys" });
    expect(store.getState().screen).toBe("settings");
    expect(store.getState().settingsGroup).toBe("hotkeys");
  });

  it("updateSettings gửi bản sửa và lấy cài đặt phía Rust trả về", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    expect(await store.getState().updateSettings({ theme: "dark" })).toBe(true);
    expect(fake.calls.at(-1)).toEqual({ cmd: "update_settings", args: { patch: { theme: "dark" } } });
    expect(store.getState().settings?.theme).toBe("dark");
    expect(store.getState().error).toBeNull();
  });

  it("giá trị bị phía Rust từ chối thì báo lỗi, cài đặt giữ nguyên", async () => {
    const { store } = setup();
    await store.getState().init();
    expect(await store.getState().updateSettings({ vadEndSilenceMs: 900 })).toBe(false);
    expect(store.getState().error).toEqual({ code: "outOfRange", field: "vadEndSilenceMs" });
    expect(store.getState().settings?.vadEndSilenceMs).toBe(300);
    store.getState().dismissError();
    expect(store.getState().error).toBeNull();
  });

  it("setHotkey trả lỗi cho ô đang sửa, không bật thanh báo lỗi chung", async () => {
    const { store } = setup();
    await store.getState().init();
    expect(await store.getState().setHotkey("toggleLock", "Ctrl+Alt+KeyH")).toEqual({
      code: "hotkeyDuplicate",
      field: "toggleLock",
    });
    expect(store.getState().error).toBeNull();
    expect(await store.getState().setHotkey("toggleLock", "Ctrl+Alt+KeyK")).toBeNull();
    expect(store.getState().settings?.hotkeys.toggleLock).toBe("Ctrl+Alt+K");
  });

  it("bắt đầu/dừng và khóa phụ đề lấy trạng thái từ kết quả", async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().toggleSession();
    expect(store.getState().status?.session).toBe("running");
    expect(store.getState().status?.overlayVisible).toBe(true);
    await store.getState().setOverlayLocked(true);
    expect(store.getState().settings?.overlay.locked).toBe(true);
  });

  it("bắt đầu phiên lỗi thì báo lỗi, trạng thái giữ nguyên", async () => {
    const { store } = setup();
    await store.getState().init();
    failToggle = true;
    await store.getState().toggleSession();
    expect(store.getState().error).toEqual({ code: "overlayFailed", field: null });
    expect(store.getState().status?.session).toBe("idle");
  });

  it("lời nhắc từ phía Rust hiện rồi đóng được", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://notice", { kind: "quitFromTray" });
    expect(store.getState().notice).toEqual({ kind: "quitFromTray" });
    store.getState().dismissNotice();
    expect(store.getState().notice).toBeNull();
  });

  it("lời nhắc Login Items có nút mở System Settings, bấm rồi thì đóng", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://notice", { kind: "loginItemsApproval" });
    expect(store.getState().notice).toEqual({ kind: "loginItemsApproval" });
    await store.getState().openLoginItemsSettings();
    expect(fake.calls.at(-1)).toEqual({ cmd: "open_login_items_settings", args: undefined });
    expect(store.getState().notice).toBeNull();
  });

  it("lệnh bị ACL chặn hay lỗi lạ thì ra mã unknown", async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().openLogDir();
    expect(store.getState().error).toEqual({ code: "unknown", field: null });
    expect(toUiError(new Error("x"))).toEqual({ code: "unknown", field: null });
  });

  it("đang ở các bước lần đầu thì không có nút mở màn hình khác", async () => {
    const { store } = setup();
    expect(canOpenScreens(store.getState())).toBe(false);
    await store.getState().init();
    expect(canOpenScreens(store.getState())).toBe(false);
    await store.getState().finishOnboarding();
    expect(canOpenScreens(store.getState())).toBe(true);
  });

  it("xong các bước lần đầu thì lưu onboardingDone và về màn hình chính", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    store.getState().navigate("about");
    await store.getState().finishOnboarding();
    expect(fake.calls.at(-1)).toEqual({ cmd: "update_settings", args: { patch: { onboardingDone: true } } });
    expect(store.getState().settings?.onboardingDone).toBe(true);
    expect(store.getState().screen).toBe("home");
  });
});
