import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { vi as viText } from "../../../i18n";
import type { AppInfo, Settings } from "../../../lib/ipc";
import { appStore } from "../appStore";
import { ComposeScreen } from "./ComposeScreen";

// Cùng cách dựng với SpeakerSettingsWiring.test.ts: store thật trên IPC giả, vẽ bằng react-dom/server (useEffect không chạy ở Node).
vi.mock("../appStore", async () => {
  const { translate } = await import("../../../i18n");
  const { fakeIpc } = await import("../../../lib/fakeIpc");
  const { createAppStore } = await import("../../../store/app");
  const store = createAppStore(fakeIpc({}).ipc);
  return {
    appStore: store,
    fallbackLanguage: "vi",
    useApp: <T>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()),
    useT: () => (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
      translate("vi", key, params),
  };
});

const settings = (compose: Partial<Settings["compose"]> = {}) =>
  ({
    uiLanguage: "vi",
    translateWhileSpeaking: true,
    targetLanguage: "vi",
    sourceLanguages: ["en"],
    sourceLock: null,
    hotkeys: { compose: "Control+Alt+G" },
    compose: { enabled: true, target: "auto", autoPaste: true, ...compose },
  }) as unknown as Settings;
const info = (platform: AppInfo["platform"]): AppInfo => ({
  name: "AI Translator",
  version: "0.0.0",
  identifier: "test",
  platform,
  launchedAtLogin: false,
  speakerAvailable: false,
});

beforeEach(() => {
  appStore.setState({ settings: settings(), info: info("macos"), accessibilityTrusted: false });
});

const screen = () => renderToStaticMarkup(createElement(ComposeScreen));

// Spec 2026-11-02-tach-go-dich-thanh-tab: màn hình Gõ dịch giữ nguyên các ô của nhóm Cài đặt trước đây (cùng id, cùng chữ).
describe("màn hình Gõ dịch", () => {
  it("có công tắc bật, ngôn ngữ đích kèm ghi chú, dùng đúng chữ cũ", () => {
    const markup = screen();
    expect(markup).toContain('id="compose-enabled"');
    expect(markup).toContain('id="compose-target"');
    expect(markup).toContain(viText["settings.compose.enabled"]);
    expect(markup).toContain(viText["settings.compose.target"]);
    expect(markup).toContain('id="compose-enabled-hint"');
  });

  it("macOS: có ô tự dán và hàng quyền Trợ năng khi tự dán bật; tắt tự dán thì ẩn hàng quyền", () => {
    expect(screen()).toContain('id="compose-auto-paste"');
    expect(screen()).toContain(viText["settings.compose.permission"]);
    appStore.setState({ settings: settings({ autoPaste: false }) });
    expect(screen()).toContain('id="compose-auto-paste"');
    expect(screen()).not.toContain(viText["settings.compose.permission"]);
  });

  it("Windows: không có ô tự dán hay quyền Trợ năng", () => {
    appStore.setState({ info: info("windows") });
    const markup = screen();
    expect(markup).toContain('id="compose-enabled"');
    expect(markup).not.toContain("compose-auto-paste");
    expect(markup).not.toContain(viText["settings.compose.permission"]);
  });

  it("chưa đọc được cài đặt thì không vẽ gì (không lỗi)", () => {
    appStore.setState({ settings: null });
    expect(screen()).toBe("");
  });
});
