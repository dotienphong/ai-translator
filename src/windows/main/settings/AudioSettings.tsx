import { useEffect, useState } from "react";
import { sourceChoices, sourceFromKey, sourceKey, sourceLabel } from "../../../lib/audioSource";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Âm thanh" (§4.3): nguồn âm thanh (§6.1) và độ nhạy ngắt câu (100–800 ms, §6.3).
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
    <div className="card">
      <div className="row">
        <label htmlFor="audio-source">{t("settings.audio.source")}</label>
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
        <button onClick={() => void load()}>{t("settings.audio.refresh")}</button>
      </div>
      <p className="hint">{t(info.platform === "macos" ? "settings.audio.hint.macos" : "settings.audio.hint.windows")}</p>
      <div className="row">
        <label htmlFor="vad-end-silence">{t("settings.audio.pause")}</label>
        <input
          id="vad-end-silence"
          type="range"
          min={100}
          max={800}
          step={50}
          value={pauseMs}
          onChange={(e) => setPause(Number(e.target.value))}
          onPointerUp={commitPause}
          onKeyUp={commitPause}
          onBlur={commitPause}
        />
        <span>{pauseMs} ms</span>
      </div>
      <p className="hint">{t("settings.audio.pause.hint")}</p>
    </div>
  );
}
