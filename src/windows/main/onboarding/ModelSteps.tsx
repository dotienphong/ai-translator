import { useEffect } from "react";
import {
  defaultChoice,
  downloadBlock,
  localized,
  needsManualDownload,
  packById,
  shouldAutoDownload,
} from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { BlockNote } from "../models/BlockNote";
import { DownloadPanel } from "../models/DownloadPanel";
import { MachineInfo } from "../models/MachineInfo";
import { ModelsError } from "../models/ModelsError";
import { PackList } from "../models/PackList";
import { useModels } from "../modelsStore";

// Bước 2 của lần đầu mở (§4.1): kiểm tra cấu hình, đề xuất gói kèm dung lượng tải và ghi chú chất lượng (§8).
export function ModelStep() {
  const t = useT();
  const view = useModels((s) => s.view);
  const choice = useModels((s) => s.choice);
  const choose = useModels((s) => s.choose);
  const current = useApp((s) => s.settings?.modelTier ?? null);
  if (!view || (view.packs.length === 0 && view.checking)) return <p className="hint">{t("models.loading")}</p>;
  const chosen = defaultChoice(view, choice, current);
  return (
    <>
      <ModelsError />
      <MachineInfo />
      {view.packs.length > 0 && <PackList view={view} choice={chosen} onChoose={choose} />}
      <p className="hint">{t("models.chooseHint")}</p>
    </>
  );
}

// Bước 3 (§4.1): tải gói đã chọn; tạm dừng rồi tải tiếp được. Vào bước này thì tự bắt đầu tải gói đã chọn
// (`shouldAutoDownload`); người dùng đi tiếp được trong lúc model tải ở nền. Đang tải gói khác (người dùng quay lại
// chọn gói khác) thì mời tạm dừng gói đó; máy chưa được hỗ trợ hay ổ không đủ chỗ thì không tải và báo lý do.
export function DownloadStep() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const view = useModels((s) => s.view);
  const choice = useModels((s) => s.choice);
  const download = useModels((s) => s.download);
  const pause = useModels((s) => s.pause);
  const current = useApp((s) => s.settings?.modelTier ?? null);
  const chosen = view ? defaultChoice(view, choice, current) : null;
  const pack = packById(view, chosen);
  const picked = choice !== null || current !== null;
  const auto = view !== null && shouldAutoDownload(view, chosen, picked);
  const manual = view !== null && needsManualDownload(view, chosen, picked);
  useEffect(() => {
    if (auto && chosen) void download(chosen);
  }, [auto, chosen, download]);
  if (!view) return <p className="hint">{t("models.loading")}</p>;
  if (!pack) {
    return (
      <>
        <ModelsError />
        <p className="hint">{t("models.noChoice")}</p>
      </>
    );
  }
  const job = view.job;
  const other = job.state === "downloading" && job.pack !== pack.id ? packById(view, job.pack) : undefined;
  const blocked = downloadBlock(view, pack) !== null;
  return (
    <>
      <ModelsError />
      {view.verdict?.kind === "unsupported" && <MachineInfo />}
      <BlockNote view={view} pack={pack} />
      {other && (
        <div className="row" role="status">
          <span>{t("models.otherDownloading", { pack: localized(other.name, lang) })}</span>
          <button onClick={() => void pause()}>{t("models.pause")}</button>
        </div>
      )}
      <DownloadPanel />
      {manual && (
        <div className="row">
          <button className="primary" onClick={() => void download(pack.id)}>
            {t("models.download")}
          </button>
        </div>
      )}
      {pack.complete ? (
        <p>{t("models.done")}</p>
      ) : (
        !blocked && !manual && <p className="hint">{t("models.continueHint")}</p>
      )}
    </>
  );
}
