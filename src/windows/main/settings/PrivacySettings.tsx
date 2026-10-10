import { useState } from "react";
import { Field } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import { useApp, useT } from "../appStore";
import { DeleteModelsAndData } from "./DeleteModelsAndData";

// Nhóm Cài đặt "Quyền riêng tư" (§4.3): bật/tắt lưu lịch sử (Pro, mặc định tắt), và nút xóa toàn bộ dữ liệu (lịch sử và
// từ điển thuật ngữ), có bước xác nhận. Xóa dữ liệu không đụng tới bản quyền, hạn mức hay cài đặt, và dùng được ở mọi gói.
// Ngay sau là nút "Xóa model và dữ liệu" của kế hoạch 04.
export function PrivacySettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const pro = useApp((s) => s.status?.pro ?? false);
  const update = useApp((s) => s.updateSettings);
  const clearAll = useApp((s) => s.clearAllData);
  const cleared = useApp((s) => s.dataCleared);
  const [confirming, setConfirming] = useState(false);
  if (!settings) return null;
  return (
    <>
      <div className="card list">
        <Field
          label={t("settings.privacy.saveHistory")}
          htmlFor="save-history"
          hint={t(pro ? "settings.privacy.saveHistory.hint" : "settings.privacy.saveHistory.pro")}
          hintId="save-history-hint"
        >
          <input
            id="save-history"
            className="switch"
            type="checkbox"
            checked={settings.saveHistory}
            disabled={!pro && !settings.saveHistory}
            aria-describedby="save-history-hint"
            onChange={(e) => void update({ saveHistory: e.target.checked })}
          />
        </Field>
      </div>
      <div className="card">
        <h2>{t("settings.privacy.clear")}</h2>
        <p className="hint">{t("settings.privacy.clear.hint")}</p>
        <div role="status">
          {!confirming && (
            <div className="actions">
              <button onClick={() => setConfirming(true)}>
                <Icon name="trash" size={16} />
                {t("settings.privacy.clear")}
              </button>
              {cleared && (
                <span className="note">
                  <Icon name="check" size={16} />
                  <span>{t("settings.privacy.cleared")}</span>
                </span>
              )}
            </div>
          )}
          {confirming && (
            <div className="confirm">
              <span>{t("settings.privacy.clear.confirm")}</span>
              <button
                className="danger"
                onClick={() => {
                  setConfirming(false);
                  void clearAll();
                }}
              >
                {t("settings.privacy.clear.yes")}
              </button>
              <button onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
            </div>
          )}
        </div>
      </div>
      <DeleteModelsAndData />
    </>
  );
}
