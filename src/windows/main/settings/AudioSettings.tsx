import { useEffect, useState } from "react";
import { sourceChoices, sourceFromKey, sourceKey, sourceLabel } from "../../../lib/audioSource";
import { Field } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Âm thanh" (§4.3): nguồn âm thanh (§6.1) và độ nhạy ngắt câu (50–800 ms, §6.3).
export function AudioSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const options = useApp((s) => s.audioSources);
  const load = useApp((s) => s.loadAudioSources);
  const update = useApp((s) => s.updateSettings);
  const [pause, setPause] = useState<number | null>(null);
  useEffect(() => {
    void load();
  }, [load]);
  if (!settings || !info) return null;
  const pauseMs = pause ?? settings.vadEndSilenceMs;
  const commitPause = () => {
    if (pause !== null && pause !== settings.vadEndSilenceMs) void update({ vadEndSilenceMs: pause });
    setPause(null);
  };
  return (
    <div className="card list">
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
      <Field label={t("settings.audio.pause")} htmlFor="vad-end-silence" hint={t("settings.audio.pause.hint")} wide>
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
