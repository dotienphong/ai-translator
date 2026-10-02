import { useEffect } from "react";
import { defaultChoice, downloadBlock, formatBytes, localized, packById } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { BlockNote } from "../models/BlockNote";
import { DownloadPanel } from "../models/DownloadPanel";
import { MachineInfo } from "../models/MachineInfo";
import { ModelsError } from "../models/ModelsError";
import { PackList } from "../models/PackList";
import { UpdateNotice } from "../models/UpdateNotice";
import { useModels } from "../modelsStore";

// Nhóm Cài đặt "Model" (§4.3): gói đang dùng, dung lượng, đổi gói, tải lại hoặc xóa.
export function ModelSettings() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const current = useApp((s) => s.settings?.modelTier ?? null);
  const view = useModels((s) => s.view);
  const choice = useModels((s) => s.choice);
  const choose = useModels((s) => s.choose);
  const load = useModels((s) => s.load);
  const download = useModels((s) => s.download);
  const select = useModels((s) => s.select);
  const remove = useModels((s) => s.remove);
  const repair = useModels((s) => s.repair);
  useEffect(() => {
    void load();
  }, [load]);
  if (!view) return <p className="hint">{t("models.loading")}</p>;
  const inUse = packById(view, current);
  const chosen = packById(view, defaultChoice(view, choice, current));
  const downloading = view.job.state === "downloading";
  return (
    <>
      <ModelsError />
      <UpdateNotice />
      <div className="card">
        <div className="row">
          <span>{t("models.current")}</span>
          <strong>{inUse?.usable ? localized(inUse.name, lang) : t("models.none")}</strong>
          {inUse && (
            <button disabled={downloading} onClick={() => void repair(inUse.id)}>
              {t("models.redownload")}
            </button>
          )}
        </div>
        <p className="hint">{t("models.used", { size: formatBytes(view.usedBytes, lang) })}</p>
        <MachineInfo />
      </div>
      <DownloadPanel />
      <PackList view={view} choice={chosen?.id ?? null} onChoose={choose} />
      {chosen && <BlockNote view={view} pack={chosen} />}
      {chosen && (
        <div className="row">
          {chosen.usable && chosen.id !== current && (
            <button className="primary" onClick={() => void select(chosen.id)}>
              {t("models.use")}
            </button>
          )}
          {!chosen.complete && (
            <button
              className="primary"
              disabled={downloading || downloadBlock(view, chosen) !== null}
              onClick={() => void download(chosen.id)}
            >
              {t(chosen.usable ? "models.download" : "models.downloadAndUse")}
            </button>
          )}
          {chosen.usable && (
            <button disabled={downloading} onClick={() => void remove(chosen.id)}>
              {t("models.delete")}
            </button>
          )}
        </div>
      )}
      <p className="hint">{t("models.nextSession")}</p>
    </>
  );
}
