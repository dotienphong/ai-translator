import { useApp, useT } from "../appStore";
import { LanguagePicker } from "../LanguagePicker";

// Màn hình chính (§4.3). Kế hoạch 02 nối nút Bắt đầu với pipeline, nguồn âm thanh và mức âm lượng;
// kế hoạch 06 điền số phút còn lại.
export function Home() {
  const t = useT();
  const status = useApp((s) => s.status);
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const toggleSession = useApp((s) => s.toggleSession);
  const pending = useApp((s) => s.sessionPending);
  const setVisible = useApp((s) => s.setOverlayVisible);
  const setLocked = useApp((s) => s.setOverlayLocked);
  if (!status || !settings || !info) return null;
  const running = status.session === "running";
  return (
    <>
      <div className="card">
        <div className="row">
          <span className={running ? "badge running" : "badge"}>{t(running ? "status.running" : "status.idle")}</span>
          <button className="primary" disabled={pending} onClick={() => void toggleSession()}>
            {t(running ? "home.stop" : "home.start")}
          </button>
        </div>
      </div>
      <div className="card">
        <h2>{t("home.languages")}</h2>
        <LanguagePicker />
      </div>
      <div className="card">
        <div className="row">
          <span>{t("home.audioSource")}</span>
          <span>{t(info.platform === "macos" ? "home.audioSource.system.macos" : "home.audioSource.system.windows")}</span>
        </div>
        <div className="row">
          <span>{t("home.inputLevel")}</span>
          <span className="hint">{t("common.notYet")}</span>
        </div>
        <div className="row">
          <span>{t("home.minutesLeft")}</span>
          <span className="hint">{t("common.notYet")}</span>
        </div>
      </div>
      <div className="card">
        <div className="row">
          <span>{t("home.overlay")}</span>
          <button onClick={() => void setVisible(!status.overlayVisible)}>
            {t(status.overlayVisible ? "home.overlay.hide" : "home.overlay.show")}
          </button>
          <button onClick={() => void setLocked(!settings.overlay.locked)}>
            {t(settings.overlay.locked ? "home.overlay.unlock" : "home.overlay.lock")}
          </button>
        </div>
      </div>
    </>
  );
}
