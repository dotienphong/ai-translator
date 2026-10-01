import type { UiLanguage } from "../../../i18n";
import type { Theme, UpdateChannel } from "../../../lib/ipc";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Chung" (§4.3). Kênh cập nhật được kế hoạch 07 dùng.
export function GeneralSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  if (!settings) return null;
  return (
    <div className="card">
      <div className="row">
        <label htmlFor="ui-language">{t("settings.general.uiLanguage")}</label>
        <select
          id="ui-language"
          value={settings.uiLanguage}
          onChange={(e) => void update({ uiLanguage: e.target.value as UiLanguage })}
        >
          <option value="en">{t("lang.en")}</option>
          <option value="vi">{t("lang.vi")}</option>
        </select>
      </div>
      <div className="row">
        <label htmlFor="launch-at-login">{t("settings.general.launchAtLogin")}</label>
        <input
          id="launch-at-login"
          type="checkbox"
          checked={settings.launchAtLogin}
          onChange={(e) => void update({ launchAtLogin: e.target.checked })}
        />
        <span className="hint">{t("settings.general.launchAtLogin.hint")}</span>
      </div>
      <div className="row">
        <label htmlFor="theme">{t("settings.general.theme")}</label>
        <select id="theme" value={settings.theme} onChange={(e) => void update({ theme: e.target.value as Theme })}>
          <option value="system">{t("theme.system")}</option>
          <option value="light">{t("theme.light")}</option>
          <option value="dark">{t("theme.dark")}</option>
        </select>
      </div>
      <div className="row">
        <label htmlFor="channel">{t("settings.general.updateChannel")}</label>
        <select
          id="channel"
          value={settings.updateChannel}
          onChange={(e) => void update({ updateChannel: e.target.value as UpdateChannel })}
        >
          <option value="stable">{t("channel.stable")}</option>
          <option value="beta">{t("channel.beta")}</option>
        </select>
      </div>
    </div>
  );
}
