import { Field } from "../../../components/Field";
import { type MessageKey, type Params, type UiLanguage, translate } from "../../../i18n";
import type { SpeakerModel } from "../../../lib/models";

export interface SpeakerSettingsCardProps {
  lang: UiLanguage;
  platform: "macos" | "windows";
  diarization: boolean;
  names: boolean;
  // macOS: đã có quyền Trợ năng chưa; `null` là chưa đọc (ghi như chưa cấp).
  trusted: boolean | null;
  model: SpeakerModel;
  onDiarization(on: boolean): void;
  onNames(on: boolean): void;
  onOpenAccessibility(): void;
}

// Nhóm "Người nói" ở Cài đặt › Phụ đề (spec 2026-10-26-phan-biet-nguoi-noi §8.3): "Phân biệt người nói" (bật sẵn), "Lấy tên từ
// Teams, Meet, Zoom" (bật sẵn, tắt theo khi "Phân biệt" tắt), và trên macOS khi cả hai bật: "Quyền Trợ năng", dùng chung nút và
// quyền với Gõ dịch (nút xóa quyền cũ sau cập nhật). Chưa có dữ liệu nhận giọng thì ghi "đang tải" (§4.5). Không thêm tab (§8.3).
// Bên gọi chỉ vẽ nhóm này khi bản này có tính năng (QĐ 9 của kế hoạch 03).
export function SpeakerSettingsCard(p: SpeakerSettingsCardProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  const modelNote = !p.diarization
    ? null
    : p.model === "downloading"
      ? t("settings.speakers.model.downloading")
      : p.model === "missing"
        ? t("settings.speakers.model.missing")
        : null;
  return (
    <section id="speaker-settings" aria-labelledby="speaker-settings-title">
      <h2 id="speaker-settings-title" className="section-title">
        {t("settings.speakers.title")}
      </h2>
      <div className="card list">
        <Field
          label={t("settings.speakers.diarization")}
          htmlFor="speaker-diarization"
          hintId="speaker-diarization-hint"
          hint={
            <>
              {t("settings.speakers.diarization.hint")}
              {modelNote && (
                <span className="field-note" role="status">
                  {modelNote}
                </span>
              )}
            </>
          }
        >
          <input
            id="speaker-diarization"
            className="switch"
            type="checkbox"
            checked={p.diarization}
            aria-describedby="speaker-diarization-hint"
            onChange={(e) => p.onDiarization(e.target.checked)}
          />
        </Field>
        <Field
          label={t("settings.speakers.names")}
          htmlFor="speaker-names"
          hintId="speaker-names-hint"
          hint={t("settings.speakers.names.hint")}
        >
          <input
            id="speaker-names"
            className="switch"
            type="checkbox"
            checked={p.diarization && p.names}
            disabled={!p.diarization}
            aria-describedby="speaker-names-hint"
            onChange={(e) => p.onNames(e.target.checked)}
          />
        </Field>
        {p.platform === "macos" && p.diarization && p.names && (
          <Field
            label={t("settings.compose.permission")}
            hint={t(p.trusted ? "settings.speakers.permission.granted" : "settings.speakers.permission.missing")}
          >
            <button type="button" onClick={p.onOpenAccessibility}>
              {t("settings.compose.permission.open")}
            </button>
          </Field>
        )}
      </div>
    </section>
  );
}
