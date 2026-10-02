import type { MessageKey } from "../../../i18n";
import { formatBytes, localized, type ModelsView, packBadges, remainingBytes } from "../../../lib/models";
import { useApp, useT } from "../appStore";

const BADGES: Record<ReturnType<typeof packBadges>[number], MessageKey> = {
  recommended: "models.recommended",
  inUse: "models.inUse",
  installed: "models.installed",
  appTooOld: "models.appTooOld",
};

// Danh sách gói để chọn (§4.1 bước 2, Cài đặt › Model): tên, dung lượng còn phải tải, ghi chú chất lượng (§8).
export function PackList({
  view,
  choice,
  onChoose,
}: {
  view: ModelsView;
  choice: string | null;
  onChoose: (pack: string) => void;
}) {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? "en");
  const current = useApp((s) => s.settings?.modelTier ?? null);
  return (
    <div className="packs" role="radiogroup" aria-label={t("onboarding.model.title")}>
      {view.packs.map((pack) => (
        <div key={pack.id} className="card">
          <div className="row">
            <label>
              <input
                type="radio"
                name="model-pack"
                checked={choice === pack.id}
                disabled={pack.appTooOld}
                onChange={() => onChoose(pack.id)}
              />{" "}
              <strong>{localized(pack.name, lang)}</strong>
            </label>
            <span className="hint">
              {t("models.size", { size: formatBytes(pack.usable ? remainingBytes(pack) : pack.bytes, lang) })}
            </span>
            {packBadges(view, pack, current).map((b) => (
              <span key={b} className="badge">
                {t(BADGES[b])}
              </span>
            ))}
          </div>
          <p className="hint">{localized(pack.note, lang)}</p>
        </div>
      ))}
    </div>
  );
}
