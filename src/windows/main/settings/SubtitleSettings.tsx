import { useEffect, useState } from "react";
import { Field, FieldSet } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import type { BackgroundColor, TextColor } from "../../../lib/ipc";
import { BACKGROUND_COLORS, TEXT_COLORS, streamingEffective, streamingNote } from "../../../lib/subtitleView";
import { useApp, useT } from "../appStore";
import { useModels } from "../modelsStore";
import { CommitRange } from "./CommitRange";
import { SpeakerSettingsCard } from "./SpeakerSettings";
import { SubtitlePreview } from "./SubtitlePreview";

// Nhóm Cài đặt "Phụ đề" (§4.3, §6.9): công tắc "Dịch trong lúc người nói chưa dừng" (spec 2026-10-10 §6.3: mặc định bật, đổi
// khi đang dịch thì áp dụng từ đoạn kế tiếp, kèm ghi chú khi máy chưa đủ nhanh), cỡ chữ (14–48), màu chữ, màu nền (bảng màu
// có sẵn, mặc định chữ trắng trên nền đen), độ mờ nền (0–100%), hiện câu gốc. Thanh phụ đề đổi ngay theo (`overlay://view`);
// nút "Hiện thanh phụ đề" để xem thử khi chưa dịch. Mỗi ô màu là một nút radio, xem trước chữ "A" với màu chữ và màu nền sẽ
// ra. Khung xem trước ở đầu nhóm (`SubtitlePreview`) vẽ một câu mẫu theo đúng cài đặt (cả lúc đang kéo thanh trượt, trước khi
// gửi), hai tầng khi chế độ dịch trong lúc nói có hiệu lực.
// Nhóm "Người nói" (spec 2026-10-26-phan-biet-nguoi-noi §8.3) ở cuối, chỉ khi bản này có tính năng (`info.speakerAvailable`); nút
// "Mở Cài đặt" của dòng mời trên thanh phụ đề cuộn tới nhóm này (`settingsFocus`).
export function SubtitleSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const update = useApp((s) => s.updateSettings);
  const setVisible = useApp((s) => s.setOverlayVisible);
  const info = useApp((s) => s.info);
  const trusted = useApp((s) => s.accessibilityTrusted);
  const loadAccessibility = useApp((s) => s.loadAccessibility);
  const openAccessibility = useApp((s) => s.openAccessibilitySettings);
  const focus = useApp((s) => s.settingsFocus);
  const clearFocus = useApp((s) => s.clearSettingsFocus);
  const speakerModel = useModels((s) => s.view?.speaker ?? "unavailable");
  const [draftSize, setDraftSize] = useState<number | null>(null);
  const [draftOpacity, setDraftOpacity] = useState<number | null>(null);
  // Bản có mã tính năng nhưng manifest chưa có mục `speaker` ("ngủ", kế hoạch 07 QĐ 3): không hiện nhóm (nút bật tắt sẽ chẳng làm gì).
  const speakers = info?.speakerAvailable === true && speakerModel !== "unavailable";
  const mac = info?.platform === "macos";
  // Quyền Trợ năng (macOS): đọc lại mỗi khi cửa sổ được focus lại, như Cài đặt › Gõ dịch.
  useEffect(() => {
    if (!speakers || !mac) return;
    void loadAccessibility();
    const onFocus = () => void loadAccessibility();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [speakers, mac, loadAccessibility]);
  // Mở từ dòng mời trên thanh phụ đề: cuộn tới nhóm Người nói rồi quên.
  const ready = settings !== null && status !== null;
  useEffect(() => {
    if (focus !== "speakers" || !ready) return;
    document.getElementById("speaker-settings")?.scrollIntoView({ block: "start" });
    clearFocus();
  }, [focus, ready, clearFocus]);
  if (!settings || !status) return null;
  const o = settings.overlay;
  const slow = streamingNote(settings.translateWhileSpeaking, status);
  return (
    <>
      <SubtitlePreview
        uiLanguage={settings.uiLanguage}
        fontSize={draftSize ?? o.fontSize}
        opacity={draftOpacity ?? o.opacity}
        textColor={o.textColor}
        background={o.background}
        showSource={o.showSource}
        live={streamingEffective(settings.translateWhileSpeaking, status)}
      />
      <div className="card list">
        <Field
          label={t("settings.subtitles.whileSpeaking")}
          htmlFor="translate-while-speaking"
          hint={
            <>
              {t("settings.subtitles.whileSpeaking.hint")}
              {slow && (
                <span className="field-note" role="status">
                  {t("settings.subtitles.whileSpeaking.slow")}
                </span>
              )}
            </>
          }
        >
          <input
            id="translate-while-speaking"
            className="switch"
            type="checkbox"
            checked={settings.translateWhileSpeaking}
            onChange={(e) => void update({ translateWhileSpeaking: e.target.checked })}
          />
        </Field>
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
      {speakers && info && (
        <SpeakerSettingsCard
          lang={settings.uiLanguage}
          platform={info.platform}
          diarization={settings.speakerDiarization}
          names={settings.speakerNames}
          trusted={trusted}
          model={speakerModel}
          onDiarization={(speakerDiarization) => void update({ speakerDiarization })}
          onNames={(speakerNames) => void update({ speakerNames })}
          onOpenAccessibility={() => void openAccessibility()}
        />
      )}
    </>
  );
}
