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
    <div className="choices" role="radiogroup" aria-label={t("onboarding.model.title")}>
      {view.packs.map((pack) => (
        <label key={pack.id} className="choice">
          <input
            type="radio"
            name="model-pack"
            checked={choice === pack.id}
            disabled={pack.appTooOld}
            aria-labelledby={`pack-${pack.id}-name`}
            aria-describedby={`pack-${pack.id}-note`}
            onChange={() => onChoose(pack.id)}
          />
          <span className="choice-body">
            <span className="choice-head">
              <span className="choice-title" id={`pack-${pack.id}-name`}>
                {localized(pack.name, lang)}
              </span>
              {packBadges(view, pack, current).map((b) => (
                <span key={b} className={b === "recommended" ? "badge recommended" : b === "inUse" ? "badge active" : "badge"}>
                  {t(BADGES[b])}
                </span>
              ))}
              <span className="hint size">
                {t("models.size", { size: formatBytes(pack.usable ? remainingBytes(pack) : pack.bytes, lang) })}
              </span>
            </span>
            <span className="hint block" id={`pack-${pack.id}-note`}>
              {localized(pack.note, lang)}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
