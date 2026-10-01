import { useRef } from "react";
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

// Nhóm cài đặt là một bộ tab (WAI-ARIA Tabs): chỉ tab đang chọn nằm trong thứ tự Tab, mũi tên trái/phải và
// Home/End chuyển tab và đưa focus theo.
export function SettingsScreen() {
  const t = useT();
  const group = useApp((s) => s.settingsGroup);
  const navigate = useApp((s) => s.navigate);
  const tabs = useRef<Partial<Record<SettingsGroup, HTMLButtonElement | null>>>({});
  const description = DESCRIPTIONS[group];
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = GROUPS.indexOf(group);
    const last = GROUPS.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    const target = next === null ? undefined : GROUPS[next];
    if (!target) return;
    e.preventDefault();
    navigate("settings", target);
    tabs.current[target]?.focus();
  };
  return (
    <>
      <div className="tabs" role="tablist" aria-label={t("nav.settings")} onKeyDown={onKeyDown}>
        {GROUPS.map((g) => (
          <button
            key={g}
            ref={(el) => {
              tabs.current[g] = el;
            }}
            id={`settings-tab-${g}`}
            role="tab"
            aria-selected={g === group}
            aria-controls="settings-panel"
            tabIndex={g === group ? 0 : -1}
            onClick={() => navigate("settings", g)}
          >
            {t(`settings.group.${g}`)}
          </button>
        ))}
      </div>
      <div
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${group}`}
        tabIndex={description ? 0 : undefined}
      >
        {group === "general" && <GeneralSettings />}
        {group === "hotkeys" && <HotkeySettings />}
        {description && (
          <div className="card">
            <p>{t(description)}</p>
            <p className="hint">{t("common.notYet")}</p>
          </div>
        )}
      </div>
    </>
  );
}
