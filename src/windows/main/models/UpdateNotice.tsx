import { formatBytes, localized, packById, remainingBytes } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { useModels } from "../modelsStore";

// Có bản mới của gói đang dùng (§6.7): hỏi trước khi tải, không tự tải.
export function UpdateNotice() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const current = useApp((s) => s.settings?.modelTier ?? null);
  const view = useModels((s) => s.view);
  const download = useModels((s) => s.download);
  const dismiss = useModels((s) => s.dismissUpdate);
  const pack = packById(view, current);
  if (!view?.updateAvailable || !pack || view.job.state === "downloading") return null;
  return (
    <div className="notice" role="status">
      <span>{t("models.update", { pack: localized(pack.name, lang), size: formatBytes(remainingBytes(pack), lang) })}</span>
      <button className="primary" onClick={() => void download(pack.id)}>
        {t("models.updateNow")}
      </button>
      <button onClick={() => void dismiss()}>{t("models.updateLater")}</button>
    </div>
  );
}
