import type { BackgroundColor, TextColor } from "../../../lib/ipc";
import { BACKGROUND_COLORS, TEXT_COLORS } from "../../../lib/subtitleView";
import { useApp, useT } from "../appStore";
import { CommitRange } from "./CommitRange";

// Nhóm Cài đặt "Phụ đề" (§4.3, §6.9): cỡ chữ (14–48), số dòng (1–3), màu chữ, màu nền (bảng màu có sẵn, mặc định chữ
// trắng trên nền đen), độ mờ nền (0–100%), hiện câu gốc. Thanh phụ đề đổi ngay theo (`overlay://view`); nút "Hiện thanh
// phụ đề" để xem thử khi chưa dịch. Mỗi ô màu là một nút radio, xem trước chữ "A" với màu chữ và màu nền sẽ ra.
export function SubtitleSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const update = useApp((s) => s.updateSettings);
  const setVisible = useApp((s) => s.setOverlayVisible);
  if (!settings || !status) return null;
  const o = settings.overlay;
  return (
    <div className="card">
      <div className="row">
        <label htmlFor="font-size">{t("settings.subtitles.fontSize")}</label>
        <CommitRange
          id="font-size"
          min={14}
          max={48}
          step={1}
          value={o.fontSize}
          format={(v) => `${v} px`}
          onCommit={(fontSize) => void update({ overlay: { fontSize } })}
        />
      </div>
      <div className="row">
        <label htmlFor="lines">{t("settings.subtitles.lines")}</label>
        <select id="lines" value={o.lines} onChange={(e) => void update({ overlay: { lines: Number(e.target.value) } })}>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="row swatches">
        <legend>{t("settings.subtitles.textColor")}</legend>
        {(Object.keys(TEXT_COLORS) as TextColor[]).map((c) => (
          <label key={c} className="swatch" title={t(`subtitleColor.${c}`)}>
            <input
              type="radio"
              name="text-color"
              checked={o.textColor === c}
              onChange={() => void update({ overlay: { textColor: c } })}
            />
            <span style={{ color: TEXT_COLORS[c], background: BACKGROUND_COLORS[o.background] }}>A</span>
            <span className="sr-only">{t(`subtitleColor.${c}`)}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="row swatches">
        <legend>{t("settings.subtitles.background")}</legend>
        {(Object.keys(BACKGROUND_COLORS) as BackgroundColor[]).map((c) => (
          <label key={c} className="swatch" title={t(`subtitleBackground.${c}`)}>
            <input
              type="radio"
              name="background-color"
              checked={o.background === c}
              onChange={() => void update({ overlay: { background: c } })}
            />
            <span style={{ color: TEXT_COLORS[o.textColor], background: BACKGROUND_COLORS[c] }}>A</span>
            <span className="sr-only">{t(`subtitleBackground.${c}`)}</span>
          </label>
        ))}
      </fieldset>
      <div className="row">
        <label htmlFor="opacity">{t("settings.subtitles.opacity")}</label>
        <CommitRange
          id="opacity"
          min={0}
          max={1}
          step={0.05}
          value={o.opacity}
          format={(v) => `${Math.round(v * 100)}%`}
          onCommit={(opacity) => void update({ overlay: { opacity } })}
        />
      </div>
      <div className="row">
        <label htmlFor="show-source">{t("settings.subtitles.showSource")}</label>
        <input
          id="show-source"
          type="checkbox"
          checked={o.showSource}
          onChange={(e) => void update({ overlay: { showSource: e.target.checked } })}
        />
      </div>
      <div className="row">
        <span>{t("home.overlay")}</span>
        <button onClick={() => void setVisible(!status.overlayVisible)}>
          {t(status.overlayVisible ? "home.overlay.hide" : "home.overlay.show")}
        </button>
      </div>
      <p className="hint">{t("settings.subtitles.hint")}</p>
    </div>
  );
}
