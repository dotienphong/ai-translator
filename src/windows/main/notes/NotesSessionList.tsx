import { Icon } from "../../../components/Icon";
import { type MessageKey, type Params, type UiLanguage, translate } from "../../../i18n";
import type { TranscriptRef } from "../../../lib/ipc";
import { dateTime, localOffsetMinutes } from "../../../lib/subtitleView";
import { type NotesTarget, sameRef } from "../../../store/notes";

export interface NotesSessionListProps {
  lang: UiLanguage;
  // Chỉ những phiên người dùng được xem (gói Free chỉ có phiên hiện tại).
  targets: NotesTarget[];
  selected: TranscriptRef | null;
  pro: boolean;
  onSelect(ref: TranscriptRef): void;
}

// Tên một phiên: "Phiên hiện tại" hay ngày giờ bắt đầu của phiên trong Lịch sử.
export function sessionTitle(x: NotesTarget, t: (key: MessageKey, params?: Params) => string): string {
  return x.ref.kind === "current" || x.startedAt === null
    ? t("notes.session.current")
    : dateTime(x.startedAt, localOffsetMinutes(x.startedAt));
}

const keyOf = (ref: TranscriptRef): string => (ref.kind === "current" ? "current" : `history:${ref.id}`);

// Cột "Cuộc họp" bên trái: mỗi phiên một dòng, ghi rõ phiên nào đã có ghi chú. Cửa sổ hẹp thì CSS ẩn cột này và hiện ô chọn
// (`NotesSessionSelect`) ở đầu trang.
export function NotesSessionRail(p: NotesSessionListProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  return (
    <aside className="notes-rail" aria-label={t("notes.sessions.title")}>
      <h2 className="notes-rail-title">{t("notes.sessions.title")}</h2>
      <ul className="notes-sessions">
        {p.targets.map((x) => {
          const selected = sameRef(x.ref, p.selected);
          return (
            <li key={keyOf(x.ref)}>
              <button
                type="button"
                className={selected ? "notes-session is-selected" : "notes-session"}
                aria-current={selected ? "true" : undefined}
                onClick={() => p.onSelect(x.ref)}
              >
                <span className="notes-session-title">{sessionTitle(x, t)}</span>
                <span className={x.hasNotes ? "notes-session-meta has-notes" : "notes-session-meta"}>
                  {x.hasNotes && <Icon name="check" size={12} />}
                  {x.hasNotes ? t("notes.session.withNotes") : t("notes.session.noNotes")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!p.pro && <p className="hint notes-rail-note">{t("notes.sessions.proOnly")}</p>}
    </aside>
  );
}

// Cùng danh sách ở dạng ô chọn, dùng khi cửa sổ hẹp.
export function NotesSessionSelect(p: NotesSessionListProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  return (
    <select
      className="notes-session-select"
      aria-label={t("notes.sessions.title")}
      value={p.selected === null ? "" : keyOf(p.selected)}
      onChange={(e) => {
        const next = p.targets.find((x) => keyOf(x.ref) === e.target.value);
        if (next) p.onSelect(next.ref);
      }}
    >
      {p.targets.map((x) => (
        <option key={keyOf(x.ref)} value={keyOf(x.ref)}>
          {sessionTitle(x, t)}
        </option>
      ))}
    </select>
  );
}
