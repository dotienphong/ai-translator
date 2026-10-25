import { useEffect, useState } from "react";
import { sourceChoices, sourceFromKey, sourceKey, sourceLabel } from "../../../lib/audioSource";
import type { CaptureMode } from "../../../lib/ipc";
import { Field } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import { appStore, useApp, useT } from "../appStore";

// Giá trị của bộ chọn micro cho micro mặc định (`micDevice: null`).
const DEFAULT_MIC = "";
// Nhóm Cài đặt "Âm thanh" (§4.3): thu từ âm thanh máy hay micro (spec 2026-10-24-nguon-micro §3.2), nguồn âm thanh máy
// (§6.1) hay micro, lọc ồn micro, quyền micro, và độ nhạy ngắt câu (50–800 ms, §6.3): chế độ âm thanh máy dùng
// `vadEndSilenceMs`, chế độ có micro dùng `micEndSilenceMs` (mặc định 50 ms), mỗi chế độ giữ mức riêng.
export function AudioSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const options = useApp((s) => s.audioSources);
  const load = useApp((s) => s.loadAudioSources);
  const devices = useApp((s) => s.inputDevices);
  const loadDevices = useApp((s) => s.loadInputDevices);
  const permission = useApp((s) => s.micPermission);
  const loadPermission = useApp((s) => s.loadMicPermission);
  const requestPermission = useApp((s) => s.requestMicPermission);
  const openMicSettings = useApp((s) => s.openMicSettings);
  const update = useApp((s) => s.updateSettings);
  const [pause, setPause] = useState<number | null>(null);
  const mode = settings?.captureMode ?? "playback";
  const usesMic = mode !== "playback";
  const usesPlayback = mode !== "mic";
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!usesMic) return;
    void loadDevices();
    void loadPermission();
  }, [usesMic, loadDevices, loadPermission]);
  if (!settings || !info) return null;
  const pauseKey = usesMic ? "micEndSilenceMs" : "vadEndSilenceMs";
  const savedPause = settings[pauseKey];
  const pauseMs = pause ?? savedPause;
  const commitPause = () => {
    if (pause !== null && pause !== savedPause) void update({ [pauseKey]: pause });
    setPause(null);
  };
  // Chọn chế độ có micro: hỏi quyền ngay nếu chưa hỏi (spec §3.4), không đợi tới lúc bắt đầu phiên.
  const chooseMode = async (captureMode: CaptureMode) => {
    if (!(await update({ captureMode })) || captureMode === "playback") return;
    await loadPermission();
    if (appStore.getState().micPermission === "undetermined") await requestPermission();
  };
  const micKnown = devices?.some((d) => d.id === settings.micDevice) ?? false;
  return (
    <div className="card list">
      <Field label={t("settings.audio.mode")} htmlFor="capture-mode" hint={t("settings.audio.mode.hint")} wide>
        <select
          id="capture-mode"
          value={settings.captureMode}
          onChange={(e) => void chooseMode(e.target.value as CaptureMode)}
        >
          <option value="playback">{t("settings.audio.mode.playback")}</option>
          <option value="mic">{t("settings.audio.mode.mic")}</option>
          <option value="both">{t("settings.audio.mode.both")}</option>
        </select>
      </Field>
      {usesPlayback && (
        <Field
          label={t("settings.audio.source")}
          htmlFor="audio-source"
          hint={t(info.platform === "macos" ? "settings.audio.hint.macos" : "settings.audio.hint.windows")}
          wide
        >
          <select
            id="audio-source"
            value={sourceKey(settings.audioSource)}
            onChange={(e) => void update({ audioSource: sourceFromKey(e.target.value) })}
          >
            {sourceChoices(settings.audioSource, options).map((o) => (
              <option key={sourceKey(o)} value={sourceKey(o)}>
                {sourceLabel(o, info.platform, options, t)}
              </option>
            ))}
          </select>
          <button onClick={() => void load()}>
            <Icon name="refresh" size={16} />
            {t("settings.audio.refresh")}
          </button>
        </Field>
      )}
      {usesMic && (
        <>
          <Field label={t("settings.audio.mic")} htmlFor="mic-device" hint={t("settings.audio.mic.hint")} wide>
            <select
              id="mic-device"
              value={settings.micDevice ?? DEFAULT_MIC}
              onChange={(e) => void update({ micDevice: e.target.value === DEFAULT_MIC ? null : e.target.value })}
            >
              <option value={DEFAULT_MIC}>{t("settings.audio.mic.default")}</option>
              {(devices ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              {settings.micDevice !== null && !micKnown && (
                <option value={settings.micDevice}>{settings.micDevice}</option>
              )}
            </select>
            <button onClick={() => void loadDevices()}>
              <Icon name="refresh" size={16} />
              {t("settings.audio.refresh")}
            </button>
          </Field>
          {mode === "both" && (
            <p className="field-note" role="note">
              {t("settings.audio.both.hint")}
            </p>
          )}
          {permission === "denied" && (
            <p className="note error" role="status">
              <Icon name="alert" size={16} />
              <span>
                {t("settings.audio.micPermission.denied")}
                {info.platform === "macos" && ` ${t("settings.audio.micPermission.reopen")}`}
              </span>
              <button onClick={() => void openMicSettings()}>{t("common.openMicSettings")}</button>
            </p>
          )}
          {permission === "undetermined" && (
            <p className="note error" role="status">
              <Icon name="alert" size={16} />
              <span>{t("settings.audio.micPermission.undetermined")}</span>
              <button onClick={() => void requestPermission()}>{t("settings.audio.micPermission.allow")}</button>
            </p>
          )}
          <Field
            label={t("settings.audio.noiseFilter")}
            htmlFor="mic-noise-filter"
            hint={t("settings.audio.noiseFilter.hint")}
          >
            <input
              id="mic-noise-filter"
              className="switch"
              type="checkbox"
              checked={settings.micNoiseFilter}
              onChange={(e) => void update({ micNoiseFilter: e.target.checked })}
            />
          </Field>
        </>
      )}
      <Field
        label={t("settings.audio.pause")}
        htmlFor="vad-end-silence"
        hint={t(usesMic ? "settings.audio.pause.micNote" : "settings.audio.pause.hint")}
        wide
      >
        <span className="range">
          <input
            id="vad-end-silence"
            type="range"
            min={50}
            max={800}
            step={50}
            value={pauseMs}
            onChange={(e) => setPause(Number(e.target.value))}
            onPointerUp={commitPause}
            onKeyUp={commitPause}
            onBlur={commitPause}
          />
          <span className="value">{pauseMs} ms</span>
        </span>
      </Field>
    </div>
  );
}
