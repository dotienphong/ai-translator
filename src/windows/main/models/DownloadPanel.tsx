import { errorKey } from "../../../i18n";
import { formatBytes, localized, packById, progress } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { useModels } from "../modelsStore";

// Tiến độ tải (§4.1 bước 3, Cài đặt › Model): thanh tiến độ, tạm dừng, tiếp tục, lỗi (§9).
export function DownloadPanel() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const view = useModels((s) => s.view);
  const download = useModels((s) => s.download);
  const pause = useModels((s) => s.pause);
  if (!view) return null;
  const job = view.job;
  if (job.state === "idle" || !job.pack) return null;
  const pack = packById(view, job.pack);
  const name = pack ? localized(pack.name, lang) : job.pack;
  const amounts = { done: formatBytes(job.doneBytes, lang), total: formatBytes(job.totalBytes, lang) };
  return (
    <div className="card" role="status">
      {job.state === "downloading" && <p className="card-title">{t("models.downloading", { pack: name })}</p>}
      {job.state === "paused" && <p className="card-title">{t("models.paused")}</p>}
      {job.state === "done" && <p className="card-title">{t("models.done")}</p>}
      {job.state === "failed" && job.error && <p className="error-text">{t(errorKey(job.error))}</p>}
      <div className="progress">
        <meter min={0} max={1} value={progress(job)} aria-label={t("models.progress", amounts)} />
        <span className="hint num">{t("models.progress", amounts)}</span>
        {job.state === "downloading" && <button onClick={() => void pause()}>{t("models.pause")}</button>}
        {(job.state === "paused" || job.state === "failed") && (
          <button className="primary" onClick={() => void download(job.pack ?? "")}>
            {t("models.resume")}
          </button>
        )}
      </div>
    </div>
  );
}
