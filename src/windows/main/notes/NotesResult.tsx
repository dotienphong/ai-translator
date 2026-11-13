import { translate, type MessageKey, type Params, type UiLanguage } from "../../../i18n";
import { Icon, type IconName } from "../../../components/Icon";
import type { Notes, NotesProvider } from "../../../lib/ipc";
import { withItem } from "../../../lib/notes";

export interface NotesResultProps {
  lang: UiLanguage;
  notes: Notes;
  source: NotesProvider;
  editing: boolean;
  onEdit: (next: Notes) => void;
  onOpenSource: (refs: number[]) => void;
}

type ItemKey = "decisions" | "actionItems" | "openQuestions";

const BLOCKS: { key: ItemKey; title: MessageKey; icon: IconName }[] = [
  { key: "decisions", title: "notes.block.decisions", icon: "check" },
  { key: "actionItems", title: "notes.block.actions", icon: "arrowRight" },
  { key: "openQuestions", title: "notes.block.questions", icon: "info" },
];

// Kết quả ghi chú: bốn thẻ (tóm tắt, quyết định, việc cần làm, câu hỏi mở), mỗi thẻ có số mục. Việc cần làm chỉ để xem: người nhận
// và hạn là hai chip, không có ô tích. Mỗi mục có nút "#số" mở câu gốc; khi sửa tay thì chữ thành ô nhập và mỗi mục có nút xóa.
// Ghi chú của model trên máy có nhãn "Bản nháp"; mọi nguồn đều nhắc kiểm lại (spec mục 8).
// Không có tên model hay tên file model ở đây: chỉ có `source`, và component này chỉ phân biệt local với cloud.
export function NotesResult(p: NotesResultProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  const { notes } = p;

  const sourceButton = (refs: number[]) =>
    refs.length === 0 ? null : (
      <button type="button" className="notes-ref" aria-label={t("notes.refs.open")} onClick={() => p.onOpenSource(refs)}>
        #{refs[0]}
      </button>
    );

  const removeButton = (key: ItemKey, index: number) => (
    <button
      type="button"
      className="notes-remove"
      aria-label={t("notes.item.remove")}
      onClick={() => p.onEdit(withItem(notes, key, index, null))}
    >
      <Icon name="trash" />
    </button>
  );

  const summary = p.editing ? (
    <textarea
      className="notes-edit"
      rows={4}
      value={notes.summary}
      aria-label={t("notes.block.summary")}
      onChange={(e) => p.onEdit({ ...notes, summary: e.target.value })}
    />
  ) : notes.summary.trim() === "" ? (
    <p className="notes-empty">{t("notes.block.empty")}</p>
  ) : (
    <p className="notes-text notes-summary">{notes.summary}</p>
  );

  const heading = (title: MessageKey, icon: IconName, count?: number) => (
    <h3 className="notes-block-title">
      <Icon name={icon} size={16} />
      {t(title)}
      {count !== undefined && count > 0 && <span className="notes-count">{count}</span>}
    </h3>
  );

  const itemText = (key: ItemKey, index: number, text: string) =>
    p.editing ? (
      <textarea
        className="notes-edit"
        rows={2}
        value={text}
        aria-label={t("notes.edit")}
        onChange={(e) => p.onEdit(withItem(notes, key, index, { text: e.target.value }))}
      />
    ) : (
      <span className="notes-text">{text}</span>
    );

  return (
    <div className="notes-result">
      <div className={p.source === "local" ? "notes-caveat is-draft" : "notes-caveat"}>
        {p.source === "local" && (
          <p role="note">
            <strong className="notes-badge">{t("notes.draft.badge")}</strong> {t("notes.draft.hint")}
          </p>
        )}
        <p className="notes-review">{t("notes.review.hint")}</p>
      </div>
      <section className="notes-block is-summary">
        {heading("notes.block.summary", "notes")}
        {summary}
      </section>
      {notes.raw ? (
        <p className="hint notes-raw">{t("notes.raw.hint")}</p>
      ) : (
        BLOCKS.map(({ key, title, icon }) => {
          const list = notes[key];
          return (
            <section className={key === "openQuestions" ? "notes-block is-quiet" : "notes-block"} key={key}>
              {heading(title, icon, list.length)}
              {list.length === 0 ? (
                <p className="notes-empty">{t("notes.block.empty")}</p>
              ) : (
                <ul className="notes-list">
                  {list.map((item, index) => (
                    <li className="notes-item" key={index}>
                      <span className="notes-dot" aria-hidden="true" />
                      {itemText(key, index, item.text)}
                      {"owner" in item && "due" in item && (
                        <span className="notes-meta">
                          {p.editing ? (
                            <>
                              <input
                                type="text"
                                className="notes-edit-small"
                                value={item.owner}
                                aria-label={t("notes.action.owner", { owner: "" })}
                                onChange={(e) =>
                                  p.onEdit(withItem(notes, "actionItems", index, { owner: e.target.value }))
                                }
                              />
                              <input
                                type="text"
                                className="notes-edit-small"
                                value={item.due}
                                aria-label={t("notes.action.due", { due: "" })}
                                onChange={(e) => p.onEdit(withItem(notes, "actionItems", index, { due: e.target.value }))}
                              />
                            </>
                          ) : (
                            <>
                              {item.owner !== "" && (
                                <span className="notes-chip is-owner">
                                  <Icon name="user" size={12} />
                                  <span className="sr-only">{t("notes.action.owner", { owner: "" })}</span>
                                  {item.owner}
                                </span>
                              )}
                              {item.due !== "" && (
                                <span className="notes-chip is-due">
                                  <span className="sr-only">{t("notes.action.due", { due: "" })}</span>
                                  {item.due}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      )}
                      {sourceButton(item.refs)}
                      {p.editing && removeButton(key, index)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
