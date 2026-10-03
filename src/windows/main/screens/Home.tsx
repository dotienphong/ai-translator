import { errorKey, type MessageKey } from "../../../i18n";
import { sourceLabel } from "../../../lib/audioSource";
import type { SessionStatus } from "../../../lib/ipc";
import { levelToMeter } from "../../../store/app";
import { useApp, useT } from "../appStore";
import { useTranscript } from "../dataStores";
import { useLicense } from "../licenseStore";
import { QuotaSummary, when } from "../LicenseText";
import { LanguagePicker } from "../LanguagePicker";
import { DownloadPanel } from "../models/DownloadPanel";
import { UpdateNotice } from "../models/UpdateNotice";

const BADGE: Record<SessionStatus, MessageKey> = {
  idle: "status.idle",
  starting: "status.starting",
  running: "status.running",
  error: "status.error",
};

// Nút chính: đang khởi động thì bấm là hủy (`session::toggle`).
const BUTTON: Record<SessionStatus, MessageKey> = {
  idle: "home.start",
  starting: "home.cancel",
  running: "home.stop",
  error: "home.start",
};

// Màn hình chính (§4.3): bắt đầu/dừng, trạng thái và lỗi của phiên, ngôn ngữ, nguồn âm thanh, mức âm lượng, hạn mức còn
// lại kèm thời điểm reset (kế hoạch 06). Hết hạn mức thì báo thời điểm reset và có nút nâng gói (§4.2 bước 2).
export function Home() {
  const t = useT();
  const status = useApp((s) => s.status);
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const audioSources = useApp((s) => s.audioSources);
  const toggleSession = useApp((s) => s.toggleSession);
  const pending = useApp((s) => s.sessionPending);
  const setVisible = useApp((s) => s.setOverlayVisible);
  const setLocked = useApp((s) => s.setOverlayLocked);
  const navigate = useApp((s) => s.navigate);
  const openPermission = useApp((s) => s.openAudioPermissionSettings);
  const hasTranscript = useTranscript((s) => (s.transcript?.lines.length ?? 0) > 0);
  const license = useLicense((s) => s.view);
  if (!status || !settings || !info) return null;
  const session = status.session;
  const notes: MessageKey[] = [];
  if (status.loading) notes.push(status.loading === "firstRun" ? "home.loading.firstRun" : "home.loading.model");
  if (status.cpuFallback) notes.push("home.cpuFallback");
  if (status.suggestLite) notes.push("home.suggestLite");
  if (session === "running") {
    if (status.indicators.lagging) notes.push("home.lagging");
    if (status.indicators.noAudio) notes.push("home.noAudio");
    if (status.waitingForApp) notes.push("home.waitingForApp");
    if (status.indicators.translationUnavailable) notes.push("home.translationUnavailable");
  }
  return (
    <>
      <div className="card">
        <div className="row">
          <span className={`badge ${session}`}>{t(BADGE[session])}</span>
          <button className="primary" disabled={pending} onClick={() => void toggleSession()}>
            {t(BUTTON[session])}
          </button>
        </div>
        {session === "error" && status.sessionError && (
          <div className="row" role="alert">
            <span className="error-text">{t(errorKey(status.sessionError))}</span>
            {status.sessionError === "audioPermission" && info.platform === "macos" && (
              <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
            )}
            {(status.sessionError === "modelMissing" || status.sessionError === "modelBroken") && (
              <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
            )}
            {status.sessionError === "quotaExhausted" && (
              <>
                {status.quotaResetAt !== null && (
                  <span className="hint">{t("quota.resetAt", { time: when(status.quotaResetAt) })}</span>
                )}
                <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>
              </>
            )}
          </div>
        )}
        {session === "running" && status.permissionSuspected && info.platform === "macos" && (
          <div className="row" role="alert">
            <span className="error-text">{t("home.permissionSuspected")}</span>
            <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
          </div>
        )}
        {session === "running" && status.quotaWarning && (
          <p className="hint" role="status">
            {t("home.quotaLow")}
          </p>
        )}
        {notes.map((key) => (
          <p key={key} className="hint" role="status">
            {t(key)}
          </p>
        ))}
        {/* Dừng xong thì mở được bản chép lời của phiên (§4.2 bước 3). */}
        {session !== "running" && session !== "starting" && hasTranscript && (
          <div className="row">
            <button onClick={() => navigate("transcript")}>{t("home.openTranscript")}</button>
          </div>
        )}
        {status.suggestLite && (
          <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
        )}
      </div>
      <UpdateNotice />
      <DownloadPanel />
      <div className="card">
        <h2>{t("home.languages")}</h2>
        <LanguagePicker />
      </div>
      <div className="card">
        <div className="row">
          <span>{t("home.audioSource")}</span>
          <span>{sourceLabel(settings.audioSource, info.platform, audioSources, t)}</span>
          <button onClick={() => navigate("settings", "audio")}>{t("home.audioSource.change")}</button>
        </div>
        <div className="row">
          <span>{t("home.inputLevel")}</span>
          <LevelMeter label={t("home.inputLevel")} />
        </div>
        {license && (
          <div className="row">
            <span>{t("home.minutesLeft")}</span>
            <QuotaSummary quota={license.quota} />
            {!status.pro && <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>}
          </div>
        )}
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

// Thanh mức âm lượng: tự theo `level` (khoảng 10 lần mỗi giây), để phần còn lại của màn hình chính không vẽ lại theo.
function LevelMeter({ label }: { label: string }) {
  const running = useApp((s) => s.status?.session === "running");
  const level = useApp((s) => s.level);
  return <meter min={0} max={1} value={running ? levelToMeter(level) : 0} aria-label={label} />;
}
