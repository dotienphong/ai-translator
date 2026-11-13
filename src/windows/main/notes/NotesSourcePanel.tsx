import { translate, type MessageKey, type Params, type UiLanguage } from "../../../i18n";
import { Icon } from "../../../components/Icon";
import type { SpeakerVoice, Subtitle } from "../../../lib/ipc";

export interface NotesSourcePanelProps {
  lang: UiLanguage;
  lines: Subtitle[];
  speakers: SpeakerVoice[];
  // Số thứ tự (từ 1) của các câu được tô; số nào không có câu tương ứng thì bỏ qua.
  refs: number[];
  onClose: () => void;
}

// Khung đối chiếu cạnh kết quả: cả bản chép lời theo thứ tự (mỗi câu mang số thứ tự, khớp với chip "#số" trong ghi chú), các câu mà
// mục ghi chú dẫn tới được tô. Bản dịch chỉ hiện khi khác
// câu gốc. Giọng đã gộp vào giọng khác thì hiện nhãn của giọng gốc (như bản chép lời ở Lịch sử).
export function NotesSourcePanel(p: NotesSourcePanelProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  const marked = new Set(p.refs.filter((n) => Number.isInteger(n) && n >= 1 && n <= p.lines.length));
  const voices = new Map(p.speakers.map((v) => [v.id, v]));
  const labelOf = (id: number | null): string | null => {
    if (id === null) return null;
    const voice = voices.get(id);
    if (!voice) return null;
    return (voice.mergedInto === null ? voice : (voices.get(voice.mergedInto) ?? voice)).label;
  };

  return (
    <aside className="notes-source" aria-label={t("notes.source.title")}>
      <div className="notes-source-head">
        <h3>{t("notes.source.title")}</h3>
        <button type="button" className="notes-icon-button" aria-label={t("common.dismiss")} onClick={p.onClose}>
          <Icon name="x" />
        </button>
      </div>
      {marked.size === 0 && <p className="hint">{t("notes.source.missing")}</p>}
      <ol className="notes-source-lines">
        {p.lines.map((line, index) => {
          const isRef = marked.has(index + 1);
          const speaker = labelOf(line.speaker);
          return (
            <li
              key={line.id}
              className={isRef ? "notes-source-line is-ref" : "notes-source-line"}
              aria-current={isRef ? "true" : undefined}
            >
              <span className="notes-source-n">{index + 1}</span>
              <span className="notes-source-body">
                {speaker !== null && <span className="notes-source-speaker">{speaker}</span>}
                <span className="notes-source-src">{line.src_text}</span>
                {line.tgt_text !== "" && line.tgt_text !== line.src_text && (
                  <span className="notes-source-tgt">{line.tgt_text}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
