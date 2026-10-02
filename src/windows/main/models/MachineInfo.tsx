import { formatBytes } from "../../../lib/models";
import { useApp, useT } from "../appStore";
import { useModels } from "../modelsStore";

// Cấu hình máy (§4.1 bước 2): RAM, dung lượng trống, card rời (Windows), và cảnh báo máy chưa được hỗ trợ (§8).
export function MachineInfo() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const view = useModels((s) => s.view);
  if (!view) return null;
  const { machine, verdict } = view;
  const discrete = machine.gpus.filter((g) => g.discrete);
  return (
    <>
      <p className="hint">
        {t("models.machine", {
          ram: formatBytes(machine.ramMib * 1_048_576, lang),
          disk: view.freeDiskBytes === null ? "?" : formatBytes(view.freeDiskBytes, lang),
        })}
      </p>
      {machine.os === "windows" && !machine.gpuKnown && <p className="hint">{t("models.gpuChecking")}</p>}
      {discrete.map((g) => (
        <p key={g.name} className="hint">
          {t("models.gpu", { name: g.name, vram: formatBytes(g.vramMib * 1_048_576, lang) })}
        </p>
      ))}
      {verdict?.kind === "unsupported" && (
        <div role="alert">
          <p className="error-text">
            {t(verdict.reason === "lowRam" ? "models.unsupported.lowRam" : "models.unsupported.noAvx2")}
          </p>
          <p className="error-text">{t("models.unsupported.requirements")}</p>
        </div>
      )}
    </>
  );
}
