import { useState } from "react";
import { Field, FieldSet } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import type { BackgroundColor, TextColor } from "../../../lib/ipc";
import { BACKGROUND_COLORS, TEXT_COLORS, overlayBackground } from "../../../lib/subtitleView";
import { useApp, useT } from "../appStore";
import { CommitRange } from "./CommitRange";

// Nhóm Cài đặt "Phụ đề" (§4.3, §6.9): cỡ chữ (14–48), màu chữ, màu nền (bảng màu có sẵn, mặc định chữ
// trắng trên nền đen), độ mờ nền (0–100%), hiện câu gốc. Thanh phụ đề đổi ngay theo (`overlay://view`); nút "Hiện thanh
// phụ đề" để xem thử khi chưa dịch. Mỗi ô màu là một nút radio, xem trước chữ "A" với màu chữ và màu nền sẽ ra.
// Khung xem trước ở đầu nhóm vẽ một câu mẫu theo đúng cài đặt (cả lúc đang kéo thanh trượt, trước khi gửi).
export function SubtitleSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const update = useApp((s) => s.updateSettings);
  const setVisible = useApp((s) => s.setOverlayVisible);
  const [draftSize, setDraftSize] = useState<number | null>(null);
  const [draftOpacity, setDraftOpacity] = useState<number | null>(null);
  if (!settings || !status) return null;
  const o = settings.overlay;
  const fontSize = draftSize ?? o.fontSize;
  const opacity = draftOpacity ?? o.opacity;
  return (
    <>
      <div className="subtitle-preview" role="img" aria-label={t("settings.subtitles.preview")}>
        <div
          className="bar"
          style={{
            fontSize: Math.min(fontSize, 34),
            color: TEXT_COLORS[o.textColor],
            background: overlayBackground(o.background, opacity),
          }}
        >
          {o.showSource && <div className="src">{t("settings.subtitles.preview.source")}</div>}
          <div className="main">{t("settings.subtitles.preview.text")}</div>
        </div>
      </div>
      <div className="card list">
        <Field label={t("settings.subtitles.fontSize")} htmlFor="font-size">
          <CommitRange
            id="font-size"
            min={14}
            max={48}
            step={1}
            value={o.fontSize}
            format={(v) => `${v} px`}
            onCommit={(fontSize) => void update({ overlay: { fontSize } })}
            onDraft={setDraftSize}
          />
        </Field>
        <FieldSet legend={t("settings.subtitles.textColor")} wide={false} className="swatches">
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
        </FieldSet>
        <FieldSet legend={t("settings.subtitles.background")} wide={false} className="swatches">
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
        </FieldSet>
        <Field label={t("settings.subtitles.opacity")} htmlFor="opacity">
          <CommitRange
            id="opacity"
            min={0}
            max={1}
            step={0.05}
            value={o.opacity}
            format={(v) => `${Math.round(v * 100)}%`}
            onCommit={(opacity) => void update({ overlay: { opacity } })}
            onDraft={setDraftOpacity}
          />
        </Field>
        <Field label={t("settings.subtitles.showSource")} htmlFor="show-source">
          <input
            id="show-source"
            className="switch"
            type="checkbox"
            checked={o.showSource}
            onChange={(e) => void update({ overlay: { showSource: e.target.checked } })}
          />
        </Field>
        <Field label={t("home.overlay")} hint={t("settings.subtitles.hint")}>
          <button onClick={() => void setVisible(!status.overlayVisible)}>
            <Icon name={status.overlayVisible ? "eyeOff" : "eye"} size={16} />
            {t(status.overlayVisible ? "home.overlay.hide" : "home.overlay.show")}
          </button>
        </Field>
      </div>
    </>
  );
}
