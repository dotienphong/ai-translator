import { useEffect } from "react";
import { Field, SectionTitle } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import { errorKey, type MessageKey, type Params, type UiLanguage, translate } from "../../../i18n";
import type { Settings, SettingsPatch, TtsStatus, TtsVoices } from "../../../lib/ipc";
import type { TtsLang } from "../../../lib/tts";
import { DEFAULT_VOICE, describeVoice, groupVoices } from "../../../lib/ttsVoices";
import type { UiError } from "../../../store/app";
import type { TtsPreviewOptions } from "../../../store/tts";
import { fallbackLanguage, useApp } from "../appStore";
import { ttsStore, useTts } from "../dataStores";
import { CommitRange } from "../settings/CommitRange";

type VoiceSettings = Pick<Settings, "ttsVoiceVi" | "ttsVoiceEn" | "ttsVolume" | "ttsSpeed" | "ttsPause">;

// Giá trị của "Khôi phục mặc định" (spec 2026-11-04-giong-doc, Global Constraints): giọng mặc định của từng ngôn ngữ (cùng giá trị
// mặc định ở phía Rust), âm lượng 100, tốc độ và khoảng nghỉ 1,0.
export const VOICE_DEFAULTS: VoiceSettings = {
  ttsVoiceVi: DEFAULT_VOICE.vi,
  ttsVoiceEn: DEFAULT_VOICE.en,
  ttsVolume: 100,
  ttsSpeed: 1,
  ttsPause: 1,
};

// Bộ dựng lệnh lưu của màn hình (tách ra để kiểm thử): chọn giọng ghi đúng khóa theo ngôn ngữ, khôi phục mặc định ghi cả năm khóa.
export const voicePatch = (lang: TtsLang, voice: string): SettingsPatch => ({ [VOICE_KEY[lang]]: voice });
export const resetPatch = (): SettingsPatch => ({ ...VOICE_DEFAULTS });

const BLOCKS: readonly TtsLang[] = ["vi", "en"];
const VOICE_KEY = { vi: "ttsVoiceVi", en: "ttsVoiceEn" } as const;

export interface VoiceScreenViewProps {
  lang: UiLanguage;
  status: TtsStatus | null;
  voices: TtsVoices | null;
  settings: VoiceSettings;
  previewing: TtsLang | null;
  loading: boolean;
  error: UiError | null;
  onVoice(lang: TtsLang, voice: string): void;
  onChange(patch: SettingsPatch): void;
  onPreview(lang: TtsLang, opts: TtsPreviewOptions): void;
  onReset(): void;
  onDismiss(): void;
}

// Màn hình Giọng đọc (spec 2026-11-04-giong-doc §7): hai cột chọn giọng (tiếng Việt, tiếng Anh), mỗi cột một ô chọn (dropdown) các
// giọng của gói nhóm theo vùng; nút Nghe thử dưới ô chọn đọc câu mẫu của cột với các giá trị đang chọn. Ba thanh trượt chỉ lưu khi
// thả (`CommitRange`). Giọng đọc chưa dùng được (đang tải gói, thiếu worker hay model) thì khóa mọi điều khiển và nói lý do.
// Giọng đang chọn: giọng đã lưu nếu gói có; không thì giọng mặc định của ngôn ngữ (Việt: Thục Đoan, Anh: Đức Trí) nếu gói có;
// không thì giọng đầu tiên của gói.
export function VoiceScreenView(p: VoiceScreenViewProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  const locked = p.status?.available === false;
  const pending = p.status?.reason === "downloading" || p.status?.reason === "waiting";
  // Chưa hỏi xong trạng thái thì chưa cho Nghe thử (chưa biết có giọng đọc không).
  const canPreview = p.status?.available === true;
  const number = (digits: number) =>
    new Intl.NumberFormat(p.lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const speed = number(2);
  const pause = number(1);
  const names = p.voices?.names ?? [];
  const groups = groupVoices(names);
  const selectedOf = (lang: TtsLang): string => {
    const saved = p.settings[VOICE_KEY[lang]];
    // Chưa có danh sách giọng thì tin giá trị đã lưu (hay mặc định): ô chọn vẫn hiện đúng một giọng.
    if (names.length === 0) return saved ?? DEFAULT_VOICE[lang];
    if (saved !== null && names.includes(saved)) return saved;
    return names.includes(DEFAULT_VOICE[lang]) ? DEFAULT_VOICE[lang] : (names[0] ?? DEFAULT_VOICE[lang]);
  };
  const optionLabel = (voice: string) => {
    const { gender } = describeVoice(voice);
    return gender === "unknown" ? voice : `${voice} (${t(`voice.gender.${gender}`)})`;
  };
  return (
    <>
      {locked && (
        <div className="notice warning" role="status">
          <Icon name="alert" />
          <span>
            {pending
              ? t("voice.locked.downloading", { percent: Math.round(p.status?.progress ?? 0) })
              : p.status?.reason === "disabled"
                ? t("voice.locked.disabled")
                : t("voice.locked.unavailable")}
          </span>
        </div>
      )}
      {p.error && (
        <div className="notice error" role="alert">
          <Icon name="alert" />
          <span>{t(errorKey(p.error.code))}</span>
          <button type="button" onClick={p.onDismiss}>
            {t("common.dismiss")}
          </button>
        </div>
      )}
      <div className="voice-cols">
        {BLOCKS.map((lang) => {
          const selected = selectedOf(lang);
          const title = `voice-${lang}-title`;
          const playing = p.previewing === lang;
          return (
            <section key={lang} aria-labelledby={title}>
              <SectionTitle id={title}>{t(`voice.lang.${lang}`)}</SectionTitle>
              <div className="card voice-pick">
                <select
                  id={`voice-${lang}`}
                  aria-labelledby={title}
                  value={selected}
                  disabled={locked}
                  onChange={(e) => p.onVoice(lang, e.target.value)}
                >
                  {names.length === 0 && <option value={selected}>{selected}</option>}
                  {groups.map((g) => (
                    <optgroup key={g.region} label={t(`voice.region.${g.region}`)}>
                      {g.names.map((name) => (
                        <option key={name} value={name}>
                          {optionLabel(name)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  className="tts-btn"
                  aria-pressed={playing}
                  disabled={locked || !canPreview}
                  onClick={() =>
                    p.onPreview(lang, {
                      text: t(`voice.sample.${lang}`),
                      voice: selected,
                      speed: p.settings.ttsSpeed,
                      pause: p.settings.ttsPause,
                      volume: p.settings.ttsVolume,
                    })
                  }
                >
                  <Icon name="speaker" size={16} />
                  {playing ? (p.loading ? t("transcript.tts.loading") : t("voice.previewStop")) : t("voice.preview")}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <section aria-labelledby="voice-style-title">
        <SectionTitle id="voice-style-title">{t("voice.title")}</SectionTitle>
        <div className="card list">
          <Field label={t("voice.volume")} htmlFor="tts-volume">
            <CommitRange
              id="tts-volume"
              min={0}
              max={100}
              step={1}
              value={p.settings.ttsVolume}
              format={(v) => `${v}%`}
              onCommit={(v) => p.onChange({ ttsVolume: Math.round(v) })}
              disabled={locked}
            />
          </Field>
          <Field label={t("voice.speed")} htmlFor="tts-speed">
            <CommitRange
              id="tts-speed"
              min={0.8}
              max={1.3}
              step={0.05}
              value={p.settings.ttsSpeed}
              format={(v) => `${speed.format(v)}×`}
              onCommit={(v) => p.onChange({ ttsSpeed: Math.round(v * 100) / 100 })}
              disabled={locked}
            />
          </Field>
          <Field label={t("voice.pause")} htmlFor="tts-pause">
            <CommitRange
              id="tts-pause"
              min={0.5}
              max={2}
              step={0.1}
              value={p.settings.ttsPause}
              format={(v) => `${pause.format(v)}×`}
              onCommit={(v) => p.onChange({ ttsPause: Math.round(v * 10) / 10 })}
              disabled={locked}
            />
          </Field>
          <div className="field voice-reset">
            <button type="button" onClick={p.onReset} disabled={locked}>
              {t("voice.reset")}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

// Nối màn hình với store: mở màn hình thì hỏi trạng thái giọng đọc và danh sách giọng; rời màn hình thì dừng Nghe thử.
export function VoiceScreen() {
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const status = useTts((s) => s.status);
  const voices = useTts((s) => s.voices);
  const previewing = useTts((s) => s.previewing);
  const loading = useTts((s) => s.loading);
  const error = useTts((s) => s.error);
  const dismiss = useTts((s) => s.dismiss);
  useEffect(() => {
    const tts = ttsStore.getState();
    void tts.init();
    void tts.loadVoices();
    return () => {
      if (ttsStore.getState().previewing !== null) void ttsStore.getState().stop();
    };
  }, []);
  if (!settings) return null;
  return (
    <VoiceScreenView
      lang={lang}
      status={status}
      voices={voices}
      settings={settings}
      previewing={previewing}
      loading={loading}
      error={error}
      onVoice={(l, voice) => void update(voicePatch(l, voice))}
      onChange={(patch) => void update(patch)}
      onPreview={(l, opts) => {
        // Khởi động bộ phát trong chính thao tác bấm (webview chỉ cho phát âm thanh sau thao tác của người dùng).
        ttsStore.getState().prepare();
        void ttsStore.getState().preview(l, opts);
      }}
      onReset={() => void update(resetPatch())}
      onDismiss={dismiss}
    />
  );
}
