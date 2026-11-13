import { useState } from "react";
import { translate, type MessageKey, type Params, type UiLanguage } from "../../../i18n";
import { Icon } from "../../../components/Icon";
import type { NotesDialog } from "../../../store/notes";
import { companyOf, type NotesSource } from "../../../lib/notes";

export interface NotesDialogsProps {
  lang: UiLanguage;
  dialog: NotesDialog | null;
  provider: NotesSource;
  // `remember` chỉ có nghĩa ở hộp cảnh báo Local (ô "Không hỏi lại"); các hộp khác luôn gọi với false.
  onConfirm: (remember: boolean) => void;
  onDismiss: () => void;
  onOpenModelSettings: () => void;
}

// Các hộp hỏi trước khi tạo ghi chú. Dùng chung khung `modal` với UpdateModal. Chỉ một hộp hiện tại một lúc, theo `dialog` của store.
export function NotesDialogs(p: NotesDialogsProps) {
  if (p.dialog === null) return null;
  return <Box key={p.dialog} {...p} dialog={p.dialog} />;
}

function Box(p: NotesDialogsProps & { dialog: NotesDialog }) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  // Hộp được tạo lại theo `dialog` (key) nên ô nhớ không rò sang lần hỏi sau.
  const [remember, setRemember] = useState(false);
  const company = companyOf(p.provider);
  const cancel = (
    <button type="button" onClick={p.onDismiss}>
      {t("notes.cancel")}
    </button>
  );
  const confirmButton = (label: MessageKey, remembered = false) => (
    <button type="button" className="primary" onClick={() => p.onConfirm(remembered)}>
      {t(label)}
    </button>
  );

  let icon: "alert" | "info" = "alert";
  let title: string;
  let body: React.ReactNode;
  let actions: React.ReactNode;
  switch (p.dialog) {
    case "localSuggest":
      icon = "info";
      title = t("notes.local.suggest.title");
      body = <p id="notes-dialog-body">{t("notes.local.suggest.body")}</p>;
      actions = (
        <>
          <button type="button" className="primary" onClick={p.onOpenModelSettings}>
            {t("notes.local.suggest.switch")}
          </button>
          <button type="button" onClick={() => p.onConfirm(false)}>
            {t("notes.local.suggest.keep")}
          </button>
          {cancel}
        </>
      );
      break;
    case "localWarning":
      title = t("notes.local.warning.title");
      body = (
        <div id="notes-dialog-body">
          <ul className="notes-warning-points">
            <li>{t("notes.local.warning.resources")}</li>
            <li>{t("notes.local.warning.slow")}</li>
            <li>{t("notes.local.warning.errors")}</li>
          </ul>
          <label className="notes-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>{t("notes.local.warning.remember")}</span>
          </label>
        </div>
      );
      actions = (
        <>
          {cancel}
          {confirmButton("notes.local.warning.go", remember)}
        </>
      );
      break;
    case "cloudConsent":
      title = t("notes.consent.title", { company });
      body = <p id="notes-dialog-body">{t("notes.consent.body", { company })}</p>;
      actions = (
        <>
          {cancel}
          {confirmButton("notes.consent.accept")}
        </>
      );
      break;
    case "overwrite":
    case "overwriteEdited":
      title = t("notes.overwrite.title");
      body = (
        <p id="notes-dialog-body">
          {p.dialog === "overwriteEdited" ? t("notes.overwrite.edited") : t("notes.overwrite.body")}
        </p>
      );
      actions = (
        <>
          {cancel}
          {confirmButton("notes.overwrite.accept")}
        </>
      );
      break;
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notes-dialog-title"
        aria-describedby="notes-dialog-body"
      >
        <div className="modal-head">
          <Icon name={icon} />
          <h2 id="notes-dialog-title">{title}</h2>
        </div>
        {body}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}
