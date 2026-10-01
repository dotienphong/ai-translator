import { LANGS, type Lang } from "../../lib/ipc";
import { useApp, useT } from "./appStore";

// Ngôn ngữ đích, tập ngôn ngữ nguồn và khóa một ngôn ngữ (F2). Dùng ở màn hình chính và bước 5 của
// lần đầu mở. Phía Rust từ chối tập nguồn rỗng; ở đây không cho bỏ chọn ngôn ngữ cuối cùng.
export function LanguagePicker() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  if (!settings) return null;
  const toggleSource = (lang: Lang, on: boolean) => {
    const next = on ? LANGS.filter((l) => l === lang || settings.sourceLanguages.includes(l)) : settings.sourceLanguages.filter((l) => l !== lang);
    void update({ sourceLanguages: next });
  };
  return (
    <>
      <div className="row">
        <label htmlFor="target">{t("languages.target")}</label>
        <select id="target" value={settings.targetLanguage} onChange={(e) => void update({ targetLanguage: e.target.value as Lang })}>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {t(`lang.${l}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <span>{t("languages.sources")}</span>
        <div className="checks">
          {LANGS.map((l) => {
            const checked = settings.sourceLanguages.includes(l);
            return (
              <label key={l}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={checked && settings.sourceLanguages.length === 1}
                  onChange={(e) => toggleSource(l, e.target.checked)}
                />{" "}
                {t(`lang.${l}`)}
              </label>
            );
          })}
        </div>
      </div>
      <div className="row">
        <label htmlFor="lock">{t("languages.lock")}</label>
        <select
          id="lock"
          value={settings.sourceLock ?? ""}
          onChange={(e) => void update({ sourceLock: e.target.value === "" ? null : (e.target.value as Lang) })}
        >
          <option value="">{t("languages.lock.auto")}</option>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {t(`lang.${l}`)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
