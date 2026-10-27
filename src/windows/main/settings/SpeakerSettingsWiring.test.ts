import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { vi as viText } from "../../../i18n";
import { fakeModelsView } from "../../../lib/fakeModels";
import type { AppInfo, AppStatus, Settings } from "../../../lib/ipc";
import type { SpeakerModel } from "../../../lib/models";
import { appStore } from "../appStore";
import { modelsStore } from "../modelsStore";
import { ModelSettings } from "./ModelSettings";
import { SubtitleSettings } from "./SubtitleSettings";

// Hai store của cửa sổ chính là store thật dựng trên IPC giả (không có Tauri trong Node); `useApp`, `useModels`, `useT` đọc đúng
// các store đó, nên test đặt trạng thái bằng `setState` rồi vẽ bằng `react-dom/server` (hook `useEffect` không chạy khi vẽ ở
// Node: không có lệnh IPC nào được gọi).
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
vi.mock("../modelsStore", async () => {
  const { fakeIpc } = await import("../../../lib/fakeIpc");
  const { createModelsStore } = await import("../../../store/models");
  const store = createModelsStore(fakeIpc({}).ipc);
  return {
    modelsStore: store,
    useModels: <T>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()),
  };
});

const settings = {
  uiLanguage: "vi",
  translateWhileSpeaking: true,
  speakerDiarization: true,
  speakerNames: true,
  modelTier: null,
  overlay: { fontSize: 22, opacity: 0.6, textColor: "white", background: "black", showSource: false },
} as unknown as Settings;
const status = { overlayVisible: true, streamingTooSlow: false } as unknown as AppStatus;
const info = (patch: Partial<AppInfo> = {}): AppInfo => ({
  name: "AI Translator",
  version: "0.0.0",
  identifier: "test",
  platform: "macos",
  launchedAtLogin: false,
  speakerAvailable: true,
  ...patch,
});

beforeEach(() => {
  appStore.setState({ settings, status, info: info(), accessibilityTrusted: false, settingsFocus: null });
  modelsStore.setState({ view: fakeModelsView() });
});

const subtitles = () => renderToStaticMarkup(createElement(SubtitleSettings));
const models = (speaker: SpeakerModel) => {
  modelsStore.setState({ view: fakeModelsView({ speaker }) });
  return renderToStaticMarkup(createElement(ModelSettings));
};

// Kế hoạch 03, QĐ 9: nhóm "Người nói" chỉ hiện khi bản này có tính năng (`AppInfo.speakerAvailable`, tức `speaker::enabled()`):
// bản phát hành không thấy gì mới.
describe("Cài đặt › Phụ đề: nhóm Người nói", () => {
  it("bản có tính năng: nhóm hiện ở cuối", () => {
    const markup = subtitles();
    expect(markup).toContain('<section id="speaker-settings"');
    expect(markup).toContain(viText["settings.speakers.title"]);
    expect(markup.indexOf('id="speaker-settings"')).toBeGreaterThan(markup.indexOf("show-source"));
  });

  it("bản không có tính năng (speakerAvailable = false): không hiện gì, cả khi hai khóa cài đặt bật", () => {
    for (const platform of ["macos", "windows"] as const) {
      appStore.setState({ info: info({ speakerAvailable: false, platform }) });
      const markup = subtitles();
      expect(markup).not.toContain("speaker-settings");
      expect(markup).not.toContain("speaker-diarization");
      expect(markup).not.toContain("speaker-names");
      expect(markup).not.toContain(viText["settings.speakers.title"]);
      expect(markup).toContain("show-source");
    }
  });

  it("chưa đọc được AppInfo (info = null): không hiện nhóm", () => {
    appStore.setState({ info: null });
    expect(subtitles()).not.toContain("speaker-settings");
  });

  it("ghi chú tải model ở nhóm lấy từ ModelsView.speaker", () => {
    modelsStore.setState({ view: fakeModelsView({ speaker: "downloading" }) });
    expect(subtitles()).toContain(viText["settings.speakers.model.downloading"]);
    modelsStore.setState({ view: fakeModelsView({ speaker: "ready" }) });
    expect(subtitles()).not.toContain(viText["settings.speakers.model.downloading"]);
  });
});

// Kế hoạch 03, QĐ 15 (ghi chú b): lỗi `modelsBusy` có lý do nhìn thấy khi đang tải dữ liệu nhận giọng.
describe("Cài đặt › Model: ghi chú đang tải dữ liệu nhận giọng", () => {
  it("chỉ hiện khi ModelsView.speaker = downloading", () => {
    expect(models("downloading")).toContain(viText["settings.model.speakerDownloading"]);
    for (const speaker of ["unavailable", "missing", "ready"] as const) {
      expect(models(speaker), speaker).not.toContain(viText["settings.model.speakerDownloading"]);
    }
  });
});
