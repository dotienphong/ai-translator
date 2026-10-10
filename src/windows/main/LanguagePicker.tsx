import { Field, FieldSet } from "../../components/Field";
import { LANGS, type Lang } from "../../lib/ipc";
import { useApp, useT } from "./appStore";

// Ngôn ngữ đích, tập ngôn ngữ nguồn và khóa một ngôn ngữ (F2). Dùng ở màn hình chính và bước 5 của
// lần đầu mở. Phía Rust từ chối tập nguồn rỗng; ở đây không cho bỏ chọn ngôn ngữ cuối cùng. Tập nguồn mới
// tính trong store, từ cài đặt mới nhất lúc bấm (`setSourceLanguage`).
export function LanguagePicker() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const setSource = useApp((s) => s.setSourceLanguage);
  if (!settings) return null;
  return (
    <>
      <Field label={t("languages.target")} htmlFor="target">
        <select id="target" value={settings.targetLanguage} onChange={(e) => void update({ targetLanguage: e.target.value as Lang })}>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {t(`lang.${l}`)}
            </option>
          ))}
        </select>
      </Field>
      <FieldSet legend={t("languages.sources")}>
        <div className="checks">
          {LANGS.map((l) => {
            const checked = settings.sourceLanguages.includes(l);
            return (
              <label key={l}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={checked && settings.sourceLanguages.length === 1}
                  onChange={(e) => void setSource(l, e.target.checked)}
                />
                {t(`lang.${l}`)}
              </label>
            );
          })}
        </div>
      </FieldSet>
      <Field label={t("languages.lock")} htmlFor="lock">
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
      </Field>
    </>
  );
}
