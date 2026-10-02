import { useState } from "react";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Quyền riêng tư" (§4.3): bật/tắt lưu lịch sử (Pro, mặc định tắt), và nút xóa toàn bộ dữ liệu (lịch sử và
// từ điển thuật ngữ), có bước xác nhận. Xóa dữ liệu không đụng tới bản quyền, hạn mức hay cài đặt, và dùng được ở mọi gói.
// Kế hoạch 04 thêm nút "Xóa model và dữ liệu" vào nhóm này.
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
      <div className="card">
        <div className="row">
          <label htmlFor="save-history">{t("settings.privacy.saveHistory")}</label>
          <input
            id="save-history"
            type="checkbox"
            checked={settings.saveHistory}
            disabled={!pro && !settings.saveHistory}
            aria-describedby="save-history-hint"
            onChange={(e) => void update({ saveHistory: e.target.checked })}
          />
        </div>
        <p id="save-history-hint" className="hint">
          {t(pro ? "settings.privacy.saveHistory.hint" : "settings.privacy.saveHistory.pro")}
        </p>
      </div>
      <div className="card">
        <h2>{t("settings.privacy.clear")}</h2>
        <p className="hint">{t("settings.privacy.clear.hint")}</p>
        <div className="row" role="status">
          {!confirming && (
            <button onClick={() => setConfirming(true)}>{t("settings.privacy.clear")}</button>
          )}
          {confirming && (
            <>
              <span className="error-text">{t("settings.privacy.clear.confirm")}</span>
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
            </>
          )}
          {!confirming && cleared && <span>{t("settings.privacy.cleared")}</span>}
        </div>
      </div>
    </>
  );
}
