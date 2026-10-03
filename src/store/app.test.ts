import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { AppInfo, AppStatus, Ipc, Settings } from "../lib/ipc";
import { canOpenScreens, createAppStore, levelToMeter, toUiError, updateInvite } from "./app";

const settings: Settings = {
  uiLanguage: "vi",
  targetLanguage: "vi",
  sourceLanguages: ["en", "zh", "ja", "ko", "vi"],
  sourceLock: null,
  audioSource: { kind: "system" },
  vadEndSilenceMs: 300,
  overlay: {
    fontSize: 22,
    lines: 2,
    opacity: 0.6,
    textColor: "white",
    background: "black",
    showSource: false,
    locked: false,
    positions: {},
    lastMonitor: null,
  },
  modelTier: null,
  hotkeys: { toggleSession: "Ctrl+Alt+T", toggleOverlay: "Ctrl+Alt+H", toggleLock: "Ctrl+Alt+L" },
  saveHistory: false,
  launchAtLogin: false,
  theme: "system",
  updateChannel: "stable",
  experimental: { translationContext: false },
  onboardingDone: false,
  revision: 1,
};
const status: AppStatus = {
  session: "idle",
  overlayVisible: true,
  hotkeyFailures: [],
  loading: null,
  sessionError: null,
  cpuFallback: false,
  suggestLite: false,
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
  permissionSuspected: false,
  waitingForApp: false,
  pro: true,
  quotaWarning: false,
  quotaResetAt: null,
  updateReady: null,
  rev: 1,
};
const info: AppInfo = {
  name: "AI Translator",
  version: "0.1.0",
  identifier: "com.aitranslator.desktop",
  platform: "macos",
  launchedAtLogin: false,
};

// `toggle_session` lỗi: "model" là lỗi của phiên (trạng thái ra "error"), "acl" là lỗi khác.
let failToggle: "model" | "acl" | null = null;
let failLoginItems = false;
let failOnboarding = false;
let failRestart = false;

function setup() {
  failToggle = null;
  failLoginItems = false;
  failOnboarding = false;
  failRestart = false;
  const fake = fakeIpc({
    get_settings: () => settings,
    get_app_status: () =>
      failToggle === "model"
        ? { ...status, session: "error", sessionError: "modelMissing", overlayVisible: true, rev: 3 }
        : status,
    get_app_info: () => info,
    update_settings: ({ patch }) => {
      if (patch.vadEndSilenceMs === 900) throw { code: "outOfRange", field: "vadEndSilenceMs", message: "…" };
      if (patch.onboardingDone && failOnboarding) throw { code: "unknown", field: null, message: "…" };
      return { ...settings, ...patch } as Settings;
    },
    set_hotkey: ({ action, accelerator }) => {
      if (accelerator === "Ctrl+Alt+KeyH") throw { code: "hotkeyDuplicate", field: action, message: "…" };
      return { ...settings, hotkeys: { ...settings.hotkeys, [action]: accelerator.replace("Key", "") } };
    },
    toggle_session: () => {
      if (failToggle === "model") throw { code: "modelMissing", field: null, message: "…" };
      if (failToggle === "acl") throw "Command toggle_session not allowed by ACL";
      return { ...status, session: "running", overlayVisible: true, rev: 2 };
    },
    list_audio_sources: () => [{ kind: "app", bundleId: "us.zoom.xos", name: "zoom.us" }],
    start_listen_test: () => ({ ...status, session: "running", overlayVisible: true, rev: 4 }),
    clear_all_data: () => null,
    get_debug_sessions: () => [],
    open_audio_permission_settings: () => null,
    set_overlay_locked: ({ locked }) => ({ ...settings, overlay: { ...settings.overlay, locked } }),
    restart_to_update: () => {
      if (failRestart) throw { code: "updateBusy", field: null, message: "…" };
      return null;
    },
    open_login_items_settings: () => {
      if (failLoginItems) throw { code: "openFailed", field: null, message: "…" };
      return null;
    },
  });
  return { fake, store: createAppStore(fake.ipc) };
}

describe("app store", () => {
  it("init đọc cài đặt, trạng thái, thông tin app và nghe năm sự kiện", async () => {
    const { fake, store } = setup();
    const off = await store.getState().init();
    expect(store.getState().settings).toEqual(settings);
    expect(store.getState().status).toEqual(status);
    expect(store.getState().info?.platform).toBe("macos");
    expect(fake.listenerCount("settings://changed")).toBe(1);
    expect(fake.listenerCount("app://status")).toBe(1);
    expect(fake.listenerCount("app://navigate")).toBe(1);
    expect(fake.listenerCount("app://notice")).toBe(1);
    expect(fake.listenerCount("audio://level")).toBe(1);
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

  it("bắt đầu phiên lỗi thì trạng thái ra lỗi kèm mã, không bật thanh báo lỗi chung", async () => {
    const { store } = setup();
    await store.getState().init();
    failToggle = "model";
    await store.getState().toggleSession();
    expect(store.getState().status?.session).toBe("error");
    expect(store.getState().status?.sessionError).toBe("modelMissing");
    expect(store.getState().error).toBeNull();
  });

  it("bắt đầu phiên lỗi thì thanh báo lỗi của lệnh trước cũng mất (chỉ còn lỗi trong trạng thái)", async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().updateSettings({ vadEndSilenceMs: 900 });
    expect(store.getState().error?.code).toBe("outOfRange");
    failToggle = "model";
    await store.getState().toggleSession();
    expect(store.getState().status?.sessionError).toBe("modelMissing");
    expect(store.getState().error).toBeNull();
  });

  it("lỗi khác của toggle_session thì lên thanh báo lỗi, trạng thái giữ nguyên", async () => {
    const { store } = setup();
    await store.getState().init();
    failToggle = "acl";
    await store.getState().toggleSession();
    expect(store.getState().error).toEqual({ code: "unknown", field: null });
    expect(store.getState().status?.session).toBe("idle");
  });

  it("mức âm lượng theo sự kiện, về 0 khi phiên dừng", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://status", { ...status, session: "running", rev: 2 });
    fake.emit("audio://level", 0.05);
    expect(store.getState().level).toBe(0.05);
    fake.emit("app://status", { ...status, session: "idle", rev: 3 });
    expect(store.getState().level).toBe(0);
  });

  it("trạng thái cũ hơn trạng thái đang có (rev nhỏ hơn) bị bỏ", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    // Sự kiện của lần dừng (rev 5) tới trước kết quả của lệnh bắt đầu (rev 2).
    fake.emit("app://status", { ...status, session: "idle", rev: 5 });
    await store.getState().toggleSession();
    expect(store.getState().status?.rev).toBe(5);
    expect(store.getState().status?.session).toBe("idle");
  });

  it("init không đè trạng thái và cài đặt mới hơn đã tới qua sự kiện trong lúc chờ", async () => {
    let fake: ReturnType<typeof fakeIpc> | null = null;
    fake = fakeIpc({
      get_settings: () => {
        fake?.emit("settings://changed", { ...settings, uiLanguage: "en" });
        return settings;
      },
      get_app_status: () => {
        fake?.emit("app://status", { ...status, session: "starting", rev: 2 });
        return status;
      },
      get_app_info: () => info,
    });
    const store = createAppStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().settings?.uiLanguage).toBe("en");
    expect(store.getState().status?.session).toBe("starting");
  });

  it("cài đặt cũ hơn bản đang có (revision nhỏ hơn) bị bỏ, dù tới từ kết quả lệnh hay từ sự kiện", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    // Sự kiện của lần đổi sau (revision 5) tới trước kết quả của lệnh đổi trước (bản giả trả revision 1).
    fake.emit("settings://changed", { ...settings, theme: "light", revision: 5 });
    expect(await store.getState().updateSettings({ theme: "dark" })).toBe(true);
    expect(store.getState().settings?.theme).toBe("light");
    fake.emit("settings://changed", { ...settings, theme: "dark", revision: 4 });
    expect(store.getState().settings?.theme).toBe("light");
    fake.emit("settings://changed", { ...settings, theme: "dark", revision: 6 });
    expect(store.getState().settings?.theme).toBe("dark");
  });

  it("init lấy kết quả của get_settings khi nó mới hơn bản đã tới qua sự kiện", async () => {
    let fake: ReturnType<typeof fakeIpc> | null = null;
    fake = fakeIpc({
      get_settings: () => {
        fake?.emit("settings://changed", { ...settings, uiLanguage: "en", revision: 0 });
        return settings;
      },
      get_app_status: () => status,
      get_app_info: () => info,
    });
    const store = createAppStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().settings).toEqual(settings);
  });

  it("đọc danh sách nguồn âm thanh và mở trang quyền ghi âm thanh", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    expect(store.getState().audioSources).toBeNull();
    await store.getState().loadAudioSources();
    expect(store.getState().audioSources).toEqual([{ kind: "app", bundleId: "us.zoom.xos", name: "zoom.us" }]);
    await store.getState().openAudioPermissionSettings();
    expect(fake.calls.at(-1)?.cmd).toBe("open_audio_permission_settings");
    expect(store.getState().error).toBeNull();
  });

  it("nghe thử bắt đầu phiên riêng; xóa toàn bộ dữ liệu báo lại; đọc bảng debug", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    await store.getState().startListenTest();
    expect(fake.calls.at(-1)?.cmd).toBe("start_listen_test");
    expect(store.getState().status?.session).toBe("running");
    await store.getState().clearAllData();
    expect(store.getState().dataCleared).toBe(true);
    expect(store.getState().debugSessions).toBeNull();
    await store.getState().loadDebugSessions();
    expect(store.getState().debugSessions).toEqual([]);
  });

  it("thanh đo âm lượng theo dBFS: −60 dB trở xuống là 0, 0 dB là đầy", () => {
    expect(levelToMeter(0)).toBe(0);
    expect(levelToMeter(0.001)).toBe(0);
    expect(levelToMeter(1)).toBe(1);
    expect(levelToMeter(0.1)).toBeCloseTo(2 / 3);
    expect(levelToMeter(Number.NaN)).toBe(0);
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

  it("lưu onboardingDone lỗi thì vẫn ở màn hình cũ và báo lỗi", async () => {
    const { store } = setup();
    await store.getState().init();
    store.getState().navigate("about");
    failOnboarding = true;
    await store.getState().finishOnboarding();
    expect(store.getState().screen).toBe("about");
    expect(store.getState().settings?.onboardingDone).toBe(false);
    expect(store.getState().error).toEqual({ code: "unknown", field: null });
  });

  it("mở Login Items lỗi thì báo lỗi, lời nhắc vẫn còn", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://notice", { kind: "loginItemsApproval" });
    failLoginItems = true;
    await store.getState().openLoginItemsSettings();
    expect(store.getState().error).toEqual({ code: "openFailed", field: null });
    expect(store.getState().notice).toEqual({ kind: "loginItemsApproval" });
  });

  it("lỗi của lệnh trước tự xóa khi lệnh sau thành công", async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().updateSettings({ vadEndSilenceMs: 900 });
    expect(store.getState().error).not.toBeNull();
    await store.getState().setOverlayLocked(true);
    expect(store.getState().error).toBeNull();
    await store.getState().openLogDir();
    expect(store.getState().error).toEqual({ code: "unknown", field: null });
    expect(await store.getState().updateSettings({ theme: "dark" })).toBe(true);
    expect(store.getState().error).toBeNull();
  });

  it("init: một lệnh đọc lỗi thì gỡ mọi listener đã đăng ký và báo lỗi cho bên gọi", async () => {
    const fake = fakeIpc({ get_settings: () => settings, get_app_status: () => status });
    const store = createAppStore(fake.ipc);
    await expect(store.getState().init()).rejects.toBeDefined();
    for (const event of ["settings://changed", "app://status", "app://navigate", "app://notice"] as const) {
      expect(fake.listenerCount(event), event).toBe(0);
    }
  });

  it("init: đăng ký một sự kiện lỗi thì gỡ các listener khác và không đọc gì", async () => {
    const fake = fakeIpc({ get_settings: () => settings, get_app_status: () => status, get_app_info: () => info });
    const ipc: Ipc = {
      invoke: fake.ipc.invoke,
      listen: (event, handler) => (event === "app://navigate" ? Promise.reject("listen lỗi") : fake.ipc.listen(event, handler)),
    };
    const store = createAppStore(ipc);
    await expect(store.getState().init()).rejects.toBe("listen lỗi");
    for (const event of ["settings://changed", "app://status", "app://notice"] as const) {
      expect(fake.listenerCount(event), event).toBe(0);
    }
    expect(fake.calls).toEqual([]);
  });

  it("bấm đúp Bắt đầu/Dừng chỉ gửi một lệnh; đang gửi thì sessionPending bật", async () => {
    let release: (s: AppStatus) => void = () => {};
    const fake = fakeIpc({
      get_settings: () => settings,
      get_app_status: () => status,
      get_app_info: () => info,
      toggle_session: () => new Promise<AppStatus>((resolve) => (release = resolve)),
    });
    const store = createAppStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().sessionPending).toBe(false);
    const first = store.getState().toggleSession();
    const second = store.getState().toggleSession();
    await second;
    expect(store.getState().sessionPending).toBe(true);
    release({ ...status, session: "running" });
    await first;
    expect(fake.calls.filter((c) => c.cmd === "toggle_session")).toHaveLength(1);
    expect(store.getState().sessionPending).toBe(false);
    expect(store.getState().status?.session).toBe("running");
  });

  it("lệnh Bắt đầu/Dừng lỗi thì sessionPending tắt lại", async () => {
    const { store } = setup();
    await store.getState().init();
    failToggle = "acl";
    await store.getState().toggleSession();
    expect(store.getState().sessionPending).toBe(false);
    failToggle = null;
    await store.getState().toggleSession();
    expect(store.getState().status?.session).toBe("running");
  });

  it("bật tắt một ngôn ngữ nguồn tính từ cài đặt mới nhất, theo thứ tự LANGS", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("settings://changed", { ...settings, sourceLanguages: ["ko"] });
    await store.getState().setSourceLanguage("en", true);
    expect(fake.calls.at(-1)).toEqual({ cmd: "update_settings", args: { patch: { sourceLanguages: ["en", "ko"] } } });
    await store.getState().setSourceLanguage("ko", false);
    expect(fake.calls.at(-1)).toEqual({ cmd: "update_settings", args: { patch: { sourceLanguages: ["en"] } } });
  });

  it("không bỏ chọn ngôn ngữ nguồn cuối cùng", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("settings://changed", { ...settings, sourceLanguages: ["ja"] });
    const before = fake.calls.length;
    await store.getState().setSourceLanguage("ja", false);
    expect(fake.calls.length).toBe(before);
  });

  it("mời cập nhật khi đã tải xong và app rảnh; Để sau ẩn đúng bản đó", () => {
    const ready = { ...status, updateReady: "0.2.0" };
    expect(updateInvite({ status, updateDismissed: null })).toBeNull();
    expect(updateInvite({ status: null, updateDismissed: null })).toBeNull();
    expect(updateInvite({ status: ready, updateDismissed: null })).toBe("0.2.0");
    expect(updateInvite({ status: { ...ready, session: "error" }, updateDismissed: null })).toBe("0.2.0");
    expect(updateInvite({ status: { ...ready, session: "running" }, updateDismissed: null })).toBeNull();
    expect(updateInvite({ status: { ...ready, session: "starting" }, updateDismissed: null })).toBeNull();
    expect(updateInvite({ status: ready, updateDismissed: "0.2.0" })).toBeNull();
    expect(updateInvite({ status: { ...ready, updateReady: "0.2.1" }, updateDismissed: "0.2.0" })).toBe("0.2.1");
  });

  it("restartToUpdate gọi lệnh; lỗi hiện ở thanh báo lỗi; dismissUpdate nhớ bản đang mời", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://status", { ...status, updateReady: "0.2.0", rev: 5 });
    await store.getState().restartToUpdate();
    expect(fake.calls.at(-1)).toEqual({ cmd: "restart_to_update", args: undefined });
    expect(store.getState().error).toBeNull();
    failRestart = true;
    await store.getState().restartToUpdate();
    expect(store.getState().error?.code).toBe("updateBusy");
    store.getState().dismissUpdate();
    expect(store.getState().updateDismissed).toBe("0.2.0");
    expect(updateInvite(store.getState())).toBeNull();
  });
});
