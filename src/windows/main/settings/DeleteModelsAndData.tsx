import { useState } from "react";
import { Icon } from "../../../components/Icon";
import { useT } from "../appStore";
import { useModels } from "../modelsStore";

// Nút "Xóa model và dữ liệu" của nhóm Quyền riêng tư (§4.3, A6): hỏi lại trong app trước khi xóa. Bản quyền và hạn
// mức còn lại được giữ (Q14).
export function DeleteModelsAndData() {
  const t = useT();
  const removeAll = useModels((s) => s.removeAll);
  const [step, setStep] = useState<"idle" | "ask" | "done">("idle");
  return (
    <div className="card">
      <h2>{t("models.deleteAll")}</h2>
      <p className="hint">{t("models.deleteAll.hint")}</p>
      {step !== "ask" && (
        <div className="actions">
          <button onClick={() => setStep("ask")}>
            <Icon name="trash" size={16} />
            {t("models.deleteAll")}
          </button>
        </div>
      )}
      {step === "ask" && (
        <div className="confirm" role="alert">
          <span>{t("models.deleteAll.ask")}</span>
          <button className="danger" onClick={() => void removeAll().then((ok) => setStep(ok ? "done" : "idle"))}>
            {t("models.deleteAll.confirm")}
          </button>
          <button onClick={() => setStep("idle")}>{t("models.deleteAll.cancel")}</button>
        </div>
      )}
      {step === "done" && (
        <p className="note" role="status">
          <Icon name="check" size={16} />
          <span>{t("models.deleteAll.done")}</span>
        </p>
      )}
    </div>
  );
}
