import { downloadBlock, formatBytes, type ModelsView, type PackView, remainingBytes } from "../../../lib/models";
import { useApp, useT } from "../appStore";

// Vì sao gói này không tải được: cần app mới hơn, hay ổ không đủ chỗ (phần còn phải tải cộng 1 GB, §6.7). Máy chưa
// được hỗ trợ thì `MachineInfo` báo, kèm cấu hình tối thiểu.
export function BlockNote({ view, pack }: { view: ModelsView; pack: PackView }) {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const block = downloadBlock(view, pack);
  if (block === "appTooOld") return <p className="error-text">{t("models.appTooOld")}</p>;
  if (block === "noSpace") {
    const size = formatBytes(remainingBytes(pack) + 1_073_741_824, lang);
    return <p className="error-text">{t("models.noSpace", { size })}</p>;
  }
  return null;
}
