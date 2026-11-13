import { translate, type MessageKey, type Params, type UiLanguage } from "../../../i18n";
import { formatBytes, type NotesPack } from "../../../lib/models";

export interface NotesPackPanelProps {
  lang: UiLanguage;
  pack: NotesPack;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

// Gói model ghi chú trên máy: tải, hủy tải, xóa. Không nêu tên model hay tên file (chỉ "Gói ghi chú trên máy"). Máy không hỗ trợ
// thì không hiện gì; máy thiếu RAM thì chỉ báo cần bao nhiêu GB (làm tròn lên) và không có nút tải.
export function NotesPackPanel(p: NotesPackPanelProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  const { pack } = p;
  if (pack.state === "unavailable") return null;
  if (pack.state === "ramTooLow") {
    return (
      <div className="notes-pack">
        <p className="hint">{t("notes.pack.ramTooLow", { gb: Math.ceil(pack.minRamMib / 1024) })}</p>
      </div>
    );
  }
  const percent = pack.bytes > 0 ? Math.min(100, Math.round((pack.done / pack.bytes) * 100)) : 0;
  return (
    <div className="notes-pack">
      <h3 className="notes-block-title">{t("notes.pack.title")}</h3>
      <p className="hint">{t("notes.pack.size", { size: formatBytes(pack.bytes, p.lang) })}</p>
      {pack.state === "downloading" && <progress max={100} value={percent} aria-label={t("notes.pack.title")} />}
      <div className="notes-pack-actions">
        {pack.state === "missing" && (
          <button type="button" className="primary" onClick={p.onDownload}>
            {t("notes.pack.download")}
          </button>
        )}
        {pack.state === "downloading" && (
          <button type="button" onClick={p.onCancel}>
            {t("notes.pack.cancel")}
          </button>
        )}
        {pack.state === "installed" && (
          <button type="button" onClick={p.onDelete}>
            {t("notes.pack.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
