import { errorKey } from "../../../i18n";
import { useT } from "../appStore";
import { useModels } from "../modelsStore";

// Lỗi của lệnh quản lý model gần nhất, và lỗi tải manifest (mất mạng, chưa có nguồn) kèm nút thử lại.
export function ModelsError() {
  const t = useT();
  const error = useModels((s) => s.error);
  const manifestError = useModels((s) => s.view?.manifestError ?? null);
  const dismiss = useModels((s) => s.dismissError);
  const load = useModels((s) => s.load);
  const code = error?.code ?? manifestError;
  if (!code) return null;
  return (
    <div className="notice error" role="alert">
      <span>{t(errorKey(code))}</span>
      {code === "modelsOffline" && <button onClick={() => void load()}>{t("models.retry")}</button>}
      {error && <button onClick={dismiss}>{t("common.dismiss")}</button>}
    </div>
  );
}
