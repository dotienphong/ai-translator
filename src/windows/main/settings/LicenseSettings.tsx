import { useState } from "react";
import { errorKey } from "../../../i18n";
import { deviceName, isRenewal } from "../../../lib/license";
import { useApp, useT } from "../appStore";
import { useLicense } from "../licenseStore";
import { PlanName, QuotaSummary, when } from "../LicenseText";

// Nhóm Cài đặt "Bản quyền" (§4.3): gói đang dùng, tình trạng, ngày hết hạn, hạn mức còn lại của chu kỳ; nhập key; gia
// hạn hay đổi gói (mở màn hình Nâng cấp); gỡ kích hoạt. Key đã đủ 2 máy thì hiện danh sách máy để gỡ một máy (§9). Key
// chỉ hiện dạng đã che; key đầy đủ nằm trong email, có nút gửi lại key qua email.
export function LicenseSettings() {
  const t = useT();
  const navigate = useApp((s) => s.navigate);
  const view = useLicense((s) => s.view);
  const devices = useLicense((s) => s.devices);
  const error = useLicense((s) => s.error);
  const busy = useLicense((s) => s.busy);
  const activate = useLicense((s) => s.activate);
  const deactivateOther = useLicense((s) => s.deactivateOther);
  const deactivate = useLicense((s) => s.deactivate);
  const validate = useLicense((s) => s.validate);
  const recover = useLicense((s) => s.recover);
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!view) return null;
  return (
    <>
      <div className="card">
        <div className="row">
          <span>{t("settings.license.plan")}</span>
          <strong>
            <PlanName plan={view.plan} />
          </strong>
          <span className={`badge ${view.standing}`}>{t(`license.standing.${view.standing}`)}</span>
        </div>
        {view.licensedPlan && view.plan === "free" && (
          <p className="hint">
            {t("settings.license.licensed")} <PlanName plan={view.licensedPlan} />
          </p>
        )}
        {view.key && (
          <div className="row">
            <span>{t("settings.license.key")}</span>
            <code>{view.key}</code>
          </div>
        )}
        {view.expiresAt !== null && (
          <div className="row">
            <span>{t("settings.license.expires")}</span>
            <span>{when(view.expiresAt)}</span>
          </div>
        )}
        <div className="row">
          <span>{t("settings.license.quota")}</span>
          <QuotaSummary quota={view.quota} />
        </div>
        {view.devOverride && <p className="hint">{t("settings.license.devOverride")}</p>}
        {!view.serverConfigured && <p className="hint">{t("settings.license.notConfigured")}</p>}
        <div className="row">
          <button className="primary" onClick={() => navigate("upgrade")}>
            {t(isRenewal(view) ? "settings.license.renew" : "settings.license.buy")}
          </button>
          {view.key && (
            <button disabled={busy} onClick={() => void validate()}>
              {t("settings.license.check")}
            </button>
          )}
        </div>
      </div>
      {!view.key && (
        <div className="card">
          <h2>{t("settings.license.activate")}</h2>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void activate(key);
            }}
          >
            <label htmlFor="license-key">{t("settings.license.keyInput")}</label>
            <input
              id="license-key"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={key}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="primary" type="submit" disabled={busy || key.trim() === ""}>
              {t("settings.license.activate.button")}
            </button>
          </form>
          {devices && (
            <div role="alert">
              <p>{t("settings.license.devices")}</p>
              <ul className="devices">
                {devices.map((d) => (
                  <li key={d.activation_id} className="row">
                    <span>{deviceName(d, t("settings.license.devices.unnamed"))}</span>
                    {d.last_validated_at !== null && (
                      <span className="hint">{t("settings.license.devices.lastUsed", { time: when(d.last_validated_at) })}</span>
                    )}
                    <button disabled={busy} onClick={() => void deactivateOther(key, d.activation_id)}>
                      {t("settings.license.devices.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div role="alert">{error && <p className="error-text">{t(errorKey(error.code))}</p>}</div>
      {view.key && (
        <div className="card">
          <h2>{t("settings.license.deactivate")}</h2>
          <p className="hint">{t("settings.license.deactivate.hint")}</p>
          <div className="row" role="status">
            {!confirming && <button onClick={() => setConfirming(true)}>{t("settings.license.deactivate")}</button>}
            {confirming && (
              <>
                <span className="error-text">{t("settings.license.deactivate.confirm")}</span>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    void deactivate();
                  }}
                >
                  {t("settings.license.deactivate.yes")}
                </button>
                <button onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="card">
        <h2>{t("settings.license.recover")}</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void recover(email).then((ok) => setSent(ok));
          }}
        >
          <label htmlFor="license-email">{t("settings.license.recover.email")}</label>
          <input id="license-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" disabled={busy || email.trim() === ""}>
            {t("settings.license.recover.button")}
          </button>
        </form>
        <p className="hint" role="status">
          {sent ? t("settings.license.recover.sent") : t("settings.license.recover.hint")}
        </p>
      </div>
    </>
  );
}
