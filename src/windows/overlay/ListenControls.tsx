import { type MessageKey, type UiLanguage, errorKey, translate } from "../../i18n";
import type { CaptureMode } from "../../lib/ipc";
import { canSpeakLang } from "../../lib/tts";
import { MIN_LEVEL } from "../../store/listen";

// "Nghe dịch" trên thanh phụ đề (spec 2026-11-02-nghe-dich-truc-tiep §8): nút bật/tắt; khi bật có thanh mức tiếng họp (phần trăm còn
// lại khi đang đọc), "còn N câu" và Bỏ qua (nếu dồn), ghi chú nếu chưa phân biệt được lời của người dùng. Lỗi hiện ngay cạnh nút.
// Lý do mờ chỉ nằm ở gợi ý (title) của nút, không chiếm chỗ trên thanh của người không dùng tính năng. Bên gọi chỉ vẽ khi thanh chưa khóa (khóa thì click đi xuyên qua). Không phải vùng kéo thanh.

export type ListenDisabledReason = "noTts" | "unsupportedLang" | "micOnly";

// Vì sao chưa bật được (nút mờ kèm lý do); `null` là dùng được.
export function listenDisabledReason(input: {
  ttsAvailable: boolean;
  targetLanguage: string;
  captureMode: CaptureMode;
}): ListenDisabledReason | null {
  if (input.captureMode === "mic") return "micOnly";
  if (!canSpeakLang(input.targetLanguage)) return "unsupportedLang";
  if (!input.ttsAvailable) return "noTts";
  return null;
}

export interface ListenControlsProps {
  uiLanguage: UiLanguage;
  supported: boolean;
  active: boolean;
  level: number;
  pending: number;
  error: string | null;
  unresolved: boolean;
  disabledReason: ListenDisabledReason | null;
  onToggle(): void;
  onLevel(level: number): void;
  onSkip(): void;
  onDismissError(): void;
}

export function ListenControls(p: ListenControlsProps) {
  if (!p.supported) return null;
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(p.uiLanguage, key, params);
  const reason = p.disabledReason === null ? null : t(`overlay.listen.${p.disabledReason}`);
  // Đang bật thì luôn tắt được, dù lý do mờ vừa xuất hiện giữa chừng.
  const disabled = !p.active && reason !== null;
  return (
    <div className="listen" data-tauri-drag-region="false">
      <button
        type="button"
        className="listen-toggle"
        data-tauri-drag-region="false"
        aria-pressed={p.active}
        disabled={disabled}
        title={reason ?? t("overlay.listen.toggle")}
        onClick={p.onToggle}
      >
        <svg className="listen-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
          <path d="M2 6h2.6L8 3v10L4.6 10H2z" fill="currentColor" />
          <path
            d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.2 3.8a6 6 0 0 1 0 8.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <span>{t("overlay.listen.toggle")}</span>
      </button>
      {p.active && (
        <>
          <label className="listen-level" data-tauri-drag-region="false">
            <span>{t("overlay.listen.level")}</span>
            <input
              type="range"
              min={MIN_LEVEL}
              max={100}
              step={1}
              value={p.level}
              data-tauri-drag-region="false"
              onChange={(e) => p.onLevel(Number(e.currentTarget.value))}
            />
          </label>
          {p.pending > 0 && (
            <>
              <span className="listen-pending">{t("overlay.listen.pending", { n: p.pending })}</span>
              <button type="button" className="listen-skip" data-tauri-drag-region="false" onClick={p.onSkip}>
                {t("overlay.listen.skip")}
              </button>
            </>
          )}
          {p.unresolved && <span className="listen-note">{t("overlay.listen.unresolved")}</span>}
        </>
      )}
      {p.error !== null && (
        <>
          <span className="listen-error" role="alert">
            {t(errorKey(p.error))}
          </span>
          <button
            type="button"
            className="listen-dismiss"
            data-tauri-drag-region="false"
            aria-label={t("overlay.listen.dismiss")}
            title={t("overlay.listen.dismiss")}
            onClick={p.onDismissError}
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}
