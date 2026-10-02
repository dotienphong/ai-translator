import { useEffect, useState } from "react";
import { ProLocked } from "../../../components/ProLocked";
import { errorKey } from "../../../i18n";
import type { GlossaryEntry } from "../../../lib/ipc";
import type { UiError } from "../../../store/app";
import { MAX_GLOSSARY } from "../../../store/library";
import { useApp, useT } from "../appStore";
import { useGlossary } from "../dataStores";

// Một dòng đang thêm hay đang sửa: hai ô, lỗi của ô (chữ nguồn trùng, rỗng, quá dài) hiện ngay dưới dòng.
function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { source: string; target: string };
  submitLabel: string;
  onSubmit: (source: string, target: string) => Promise<UiError | null>;
  onCancel?: () => void;
}) {
  const t = useT();
  const [source, setSource] = useState(initial.source);
  const [target, setTarget] = useState(initial.target);
  const [error, setError] = useState<UiError | null>(null);
  const [sending, setSending] = useState(false);
  const errorId = `glossary-error-${initial.source || "new"}`;
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (sending) return;
        setSending(true);
        void onSubmit(source, target).then((err) => {
          setSending(false);
          setError(err);
          if (!err && !onCancel) {
            setSource("");
            setTarget("");
          }
        });
      }}
    >
      <input
        type="text"
        aria-label={t("glossary.source")}
        placeholder={t("glossary.source")}
        value={source}
        maxLength={200}
        aria-invalid={error?.field === "source"}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setSource(e.target.value)}
      />
      <input
        type="text"
        aria-label={t("glossary.target")}
        placeholder={t("glossary.target")}
        value={target}
        maxLength={200}
        aria-invalid={error?.field === "target"}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setTarget(e.target.value)}
      />
      <button type="submit" className="primary" disabled={sending}>
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      )}
      {error && (
        <span id={errorId} className="error-text" role="alert">
          {t(errorKey(error.code))}
        </span>
      )}
    </form>
  );
}

// Từ điển thuật ngữ (F5, Pro): tối đa 500 cặp; thêm, sửa, xóa; nhập và xuất CSV (hai cột `source,target`, UTF-8).
// Thuật ngữ có trong câu được đưa vào prompt khi dịch (§6.5). Gói Free thì khóa, kèm nút Nâng cấp.
export function GlossaryScreen() {
  const t = useT();
  const pro = useApp((s) => s.status?.pro ?? false);
  const navigate = useApp((s) => s.navigate);
  const entries = useGlossary((s) => s.entries);
  const error = useGlossary((s) => s.error);
  const report = useGlossary((s) => s.report);
  const exported = useGlossary((s) => s.exported);
  const load = useGlossary((s) => s.load);
  const add = useGlossary((s) => s.add);
  const update = useGlossary((s) => s.update);
  const remove = useGlossary((s) => s.remove);
  const importCsv = useGlossary((s) => s.importCsv);
  const exportCsv = useGlossary((s) => s.exportCsv);
  const dismiss = useGlossary((s) => s.dismiss);
  const [editing, setEditing] = useState<number | null>(null);
  useEffect(() => {
    if (pro) void load();
  }, [pro, load]);
  if (!pro) return <ProLocked text={t("glossary.pro")} upgradeLabel={t("pro.upgrade")} onUpgrade={() => navigate("upgrade")} />;
  const list: GlossaryEntry[] = entries ?? [];
  const full = list.length >= MAX_GLOSSARY;
  return (
    <>
      <div className="card">
        <p className="hint">{t("glossary.hint")}</p>
        <p>{t("glossary.count", { n: list.length, max: MAX_GLOSSARY })}</p>
        {!full && (
          <EntryForm initial={{ source: "", target: "" }} submitLabel={t("glossary.add")} onSubmit={add} />
        )}
        {full && <p className="hint">{t("error.glossaryFull")}</p>}
        <div className="row">
          <button onClick={() => void importCsv()}>{t("glossary.import")}</button>
          <button onClick={() => void exportCsv()} disabled={list.length === 0}>
            {t("glossary.export")}
          </button>
        </div>
        <p className="hint">{t("glossary.csvHint")}</p>
        <div role="status">
          {report && (
            <div className="notice">
              <span>{t("glossary.imported", { ...report })}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
          {exported && (
            <div className="notice">
              <span>{t("transcript.exported", { path: exported })}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
        </div>
        <div role="alert">
          {error && (
            <div className="notice error">
              <span>{t(errorKey(error.code))}</span>
              <button onClick={dismiss}>{t("common.dismiss")}</button>
            </div>
          )}
        </div>
      </div>
      <ul className="glossary">
        {list.map((e) =>
          editing === e.id ? (
            <li key={e.id}>
              <EntryForm
                initial={e}
                submitLabel={t("glossary.save")}
                onSubmit={async (source, target) => {
                  const err = await update(e.id, source, target);
                  if (!err) setEditing(null);
                  return err;
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={e.id} className="row">
              <span className="term">{e.source}</span>
              <span aria-hidden="true">→</span>
              <span className="term">{e.target}</span>
              <button onClick={() => setEditing(e.id)}>{t("glossary.edit")}</button>
              <button onClick={() => void remove(e.id)}>{t("history.delete")}</button>
            </li>
          ),
        )}
      </ul>
    </>
  );
}
