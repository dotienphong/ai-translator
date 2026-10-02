import { useState } from "react";
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
      <div className="row">
        <span>{t("models.deleteAll")}</span>
        {step !== "ask" && <button onClick={() => setStep("ask")}>{t("models.deleteAll")}</button>}
      </div>
      <p className="hint">{t("models.deleteAll.hint")}</p>
      {step === "ask" && (
        <div className="row" role="alert">
          <span className="error-text">{t("models.deleteAll.ask")}</span>
          <button className="primary" onClick={() => void removeAll().then((ok) => setStep(ok ? "done" : "idle"))}>
            {t("models.deleteAll.confirm")}
          </button>
          <button onClick={() => setStep("idle")}>{t("models.deleteAll.cancel")}</button>
        </div>
      )}
      {step === "done" && (
        <p className="hint" role="status">
          {t("models.deleteAll.done")}
        </p>
      )}
    </div>
  );
}
