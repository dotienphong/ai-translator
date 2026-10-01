import type { MessageKey } from "../../../i18n";
import type { SettingsGroup } from "../../../lib/ipc";
import { useApp, useT } from "../appStore";
import { GeneralSettings } from "../settings/GeneralSettings";
import { HotkeySettings } from "../settings/HotkeySettings";

const GROUPS: readonly SettingsGroup[] = ["general", "subtitles", "audio", "model", "hotkeys", "license", "privacy"];

// Nhóm do kế hoạch khác làm: Phụ đề (03), Âm thanh (02), Model (04), Bản quyền (06), Quyền riêng tư (03, 04).
const DESCRIPTIONS: Partial<Record<SettingsGroup, MessageKey>> = {
  subtitles: "settings.subtitles.description",
  audio: "settings.audio.description",
  model: "settings.model.description",
  license: "settings.license.description",
  privacy: "settings.privacy.description",
};

export function SettingsScreen() {
  const t = useT();
  const group = useApp((s) => s.settingsGroup);
  const navigate = useApp((s) => s.navigate);
  const description = DESCRIPTIONS[group];
  return (
    <>
      <div className="tabs" role="tablist">
        {GROUPS.map((g) => (
          <button key={g} role="tab" aria-selected={g === group} onClick={() => navigate("settings", g)}>
            {t(`settings.group.${g}`)}
          </button>
        ))}
      </div>
      {group === "general" && <GeneralSettings />}
      {group === "hotkeys" && <HotkeySettings />}
      {description && (
        <div className="card">
          <p>{t(description)}</p>
          <p className="hint">{t("common.notYet")}</p>
        </div>
      )}
    </>
  );
}
