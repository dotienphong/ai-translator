import { type MessageKey, type UiLanguage, translate } from "../../i18n";

// Dòng mời cấp quyền Trợ năng trên thanh phụ đề (spec 2026-10-26-phan-biet-nguoi-noi §6.7, §8.1): trên cùng, nền mờ, chữ nhỏ. "Mở
// Cài đặt" gọi lệnh duy nhất kế hoạch 03 thêm cho cửa sổ này (`open_speaker_settings`, không tham số); ✕ ẩn tới hết phiên. Bên gọi
// chỉ vẽ khi thanh chưa khóa (khóa thì click đi xuyên qua). Không phải vùng kéo thanh.
export interface SpeakerAskProps {
  uiLanguage: UiLanguage;
  onOpen(): void;
  onDismiss(): void;
}

export function SpeakerAsk({ uiLanguage, onOpen, onDismiss }: SpeakerAskProps) {
  const t = (key: MessageKey) => translate(uiLanguage, key);
  return (
    <div className="ask" role="status" data-tauri-drag-region="false">
      <span aria-hidden="true">🔒</span>
      <span className="ask-text">{t("overlay.speakers.ask")}</span>
      <button type="button" className="ask-open" data-tauri-drag-region="false" onClick={onOpen}>
        {t("notice.openSettings")}
      </button>
      <button
        type="button"
        className="ask-close"
        data-tauri-drag-region="false"
        aria-label={t("overlay.speakers.dismiss")}
        title={t("overlay.speakers.dismiss")}
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}
