import { useEffect } from "react";
import { Field } from "../../../components/Field";
import { autoTarget } from "../../../lib/compose";
import { formatAccelerator } from "../../../lib/hotkeys";
import { type ComposeTarget, LANGS } from "../../../lib/ipc";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Gõ dịch" (spec 2026-10-17-go-dich §1.4): công tắc bật (tắt thì gỡ phím tắt, phím vẫn giữ), ngôn ngữ đích ("Tự
// động" ghi rõ đang là ngôn ngữ nào), và chỉ trên macOS: tự dán cùng trạng thái quyền Trợ năng (đọc lại mỗi khi cửa sổ được
// focus lại, vì người dùng bật quyền ở System Settings rồi quay về). Phím tắt đổi ở nhóm Phím tắt.
export function ComposeSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const trusted = useApp((s) => s.accessibilityTrusted);
  const update = useApp((s) => s.updateSettings);
  const loadAccessibility = useApp((s) => s.loadAccessibility);
  const openAccessibility = useApp((s) => s.openAccessibilitySettings);
  const mac = info?.platform === "macos";
  useEffect(() => {
    if (!mac) return;
    void loadAccessibility();
    const onFocus = () => void loadAccessibility();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [mac, loadAccessibility]);
  if (!settings || !info) return null;
  const compose = settings.compose;
  const hotkey = formatAccelerator(settings.hotkeys.compose, info.platform);
  return (
    <div className="card list">
      <Field
        label={t("settings.compose.enabled")}
        htmlFor="compose-enabled"
        hint={t("settings.compose.enabled.hint", { hotkey })}
        hintId="compose-enabled-hint"
      >
        <input
          id="compose-enabled"
          className="switch"
          type="checkbox"
          checked={compose.enabled}
          aria-describedby="compose-enabled-hint"
          onChange={(e) => void update({ compose: { enabled: e.target.checked } })}
        />
      </Field>
      <Field
        label={t("settings.compose.target")}
        htmlFor="compose-target"
        hint={t("settings.compose.target.hint")}
        hintId="compose-target-hint"
      >
        <select
          id="compose-target"
          value={compose.target}
          aria-describedby="compose-target-hint"
          onChange={(e) => void update({ compose: { target: e.target.value as ComposeTarget } })}
        >
          <option value="auto">{t("settings.compose.target.auto", { lang: t(`lang.${autoTarget(settings)}`) })}</option>
          {LANGS.map((lang) => (
            <option key={lang} value={lang}>
              {t(`lang.${lang}`)}
            </option>
          ))}
        </select>
      </Field>
      {mac && (
        <Field
          label={t("settings.compose.autoPaste")}
          htmlFor="compose-auto-paste"
          hint={t("settings.compose.autoPaste.hint")}
          hintId="compose-auto-paste-hint"
        >
          <input
            id="compose-auto-paste"
            className="switch"
            type="checkbox"
            checked={compose.autoPaste}
            aria-describedby="compose-auto-paste-hint"
            onChange={(e) => void update({ compose: { autoPaste: e.target.checked } })}
          />
        </Field>
      )}
      {mac && compose.autoPaste && (
        <Field
          label={t("settings.compose.permission")}
          hint={t(trusted ? "settings.compose.permission.granted" : "settings.compose.permission.missing")}
        >
          <button onClick={() => void openAccessibility()}>{t("settings.compose.permission.open")}</button>
        </Field>
      )}
    </div>
  );
}
