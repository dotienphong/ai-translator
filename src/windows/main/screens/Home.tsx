import { useEffect } from "react";
import { Field } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import { errorKey, type MessageKey } from "../../../i18n";
import { sourceLabel } from "../../../lib/audioSource";
import type { SessionStatus } from "../../../lib/ipc";
import { levelToMeter } from "../../../store/app";
import { useApp, useT } from "../appStore";
import { useTranscript } from "../dataStores";
import { trialKey } from "../../../lib/license";
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
// lại kèm thời điểm reset (kế hoạch 06). Hết hạn mức thì báo thời điểm reset và có nút nâng gói (§4.2 bước 2). Ở Free có
// thêm số ngày dùng thử còn lại; hết dùng thử hay key đang xung đột thì có nút tới Nâng cấp hay Bản quyền (spec 2026-10-07
// §3.2, §4.2).
// Khối trên cùng gom trạng thái, nút Bắt đầu/Dừng và mức âm lượng; các thẻ bên dưới là ngôn ngữ, nguồn âm thanh, hạn mức và
// thanh phụ đề.
export function Home() {
  const t = useT();
  const status = useApp((s) => s.status);
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const audioSources = useApp((s) => s.audioSources);
  const loadAudioSourceNames = useApp((s) => s.loadAudioSourceNames);
  const toggleSession = useApp((s) => s.toggleSession);
  const pending = useApp((s) => s.sessionPending);
  const setVisible = useApp((s) => s.setOverlayVisible);
  const setLocked = useApp((s) => s.setOverlayLocked);
  const navigate = useApp((s) => s.navigate);
  const openPermission = useApp((s) => s.openAudioPermissionSettings);
  const hasTranscript = useTranscript((s) => (s.transcript?.lines.length ?? 0) > 0);
  const license = useLicense((s) => s.view);
  // Tên của nguồn đang chọn (tên app trên macOS, tên thiết bị trên Windows) nằm trong danh sách nguồn: đọc lặng lẽ một
  // lần khi chưa có, để màn hình chính không hiện bundle ID hay id thiết bị.
  const needsNames = settings !== null && settings.audioSource.kind !== "system" && audioSources === null;
  useEffect(() => {
    if (needsNames) void loadAudioSourceNames();
  }, [needsNames, loadAudioSourceNames]);
  if (!status || !settings || !info) return null;
  const session = status.session;
  const trial = license && trialKey(license);
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
  const source = sourceLabel(settings.audioSource, info.platform, audioSources, t);
  const buttonClass = session === "running" ? "lg danger" : session === "starting" ? "lg" : "lg primary";
  return (
    <>
      <div className="card hero">
        <div className="hero-status">
          <div className="hero-state">
            <span className={`status-dot ${session}`} aria-hidden="true" />
            <span>{t(BADGE[session])}</span>
          </div>
          <p className="hero-sub">
            {source} <span aria-hidden="true">→</span> {t(`lang.${settings.targetLanguage}`)}
          </p>
          <div className="hero-level">
            <Icon name="mic" size={16} />
            <span>{t("home.inputLevel")}</span>
            <LevelMeter label={t("home.inputLevel")} />
          </div>
        </div>
        <button className={buttonClass} disabled={pending} onClick={() => void toggleSession()}>
          <Icon name={session === "running" ? "stop" : session === "starting" ? "x" : "play"} size={16} />
          {t(BUTTON[session])}
        </button>
        {session === "error" && status.sessionError && (
          <div className="hero-alert" role="alert">
            <Icon name="alert" />
            <span>{t(errorKey(status.sessionError))}</span>
            {status.sessionError === "audioPermission" && info.platform === "macos" && (
              <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
            )}
            {(status.sessionError === "modelMissing" || status.sessionError === "modelBroken") && (
              <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
            )}
            {(status.sessionError === "trialEnded" || status.sessionError === "licenseExpired") && (
              <button onClick={() => navigate("upgrade")}>{t("settings.license.buy")}</button>
            )}
            {status.sessionError === "licenseConflict" && (
              <button onClick={() => navigate("settings", "license")}>{t("notice.openSettings")}</button>
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
          <div className="hero-alert" role="alert">
            <Icon name="alert" />
            <span>{t("home.permissionSuspected")}</span>
            <button onClick={() => void openPermission()}>{t("common.openPermissionSettings")}</button>
          </div>
        )}
        {(notes.length > 0 || (session === "running" && status.quotaWarning)) && (
          <div className="hero-notes">
            {session === "running" && status.quotaWarning && (
              <p className="note error" role="status">
                <Icon name="alert" size={16} />
                <span>{t("home.quotaLow")}</span>
              </p>
            )}
            {notes.map((key) => (
              <p key={key} className="note" role="status">
                <Icon name="info" size={16} />
                <span>{t(key)}</span>
              </p>
            ))}
          </div>
        )}
        {/* Dừng xong thì mở được bản chép lời của phiên (§4.2 bước 3). */}
        {((session !== "running" && session !== "starting" && hasTranscript) || status.suggestLite) && (
          <div className="actions">
            {session !== "running" && session !== "starting" && hasTranscript && (
              <button onClick={() => navigate("transcript")}>
                <Icon name="transcript" size={16} />
                {t("home.openTranscript")}
              </button>
            )}
            {status.suggestLite && (
              <button onClick={() => navigate("settings", "model")}>{t("models.openSettings")}</button>
            )}
          </div>
        )}
      </div>
      <UpdateNotice />
      <DownloadPanel />
      <div className="card">
        <h2>{t("home.languages")}</h2>
        <LanguagePicker />
      </div>
      <div className="card list">
        <Field label={t("home.audioSource")} hint={source}>
          <button onClick={() => navigate("settings", "audio")}>{t("home.audioSource.change")}</button>
        </Field>
        {license && (
          <Field
            label={t("home.minutesLeft")}
            hint={
              <>
                {trial && (
                  <>
                    {t(trial, { days: license.trial.daysLeft })}
                    {license.trial.status !== "ended" && " · "}
                  </>
                )}
                {license.trial.status !== "ended" && <QuotaSummary quota={license.quota} />}
              </>
            }
          >
            {!status.pro && (
              <button className="primary" onClick={() => navigate("upgrade")}>
                <Icon name="upgrade" size={16} />
                {t("settings.license.buy")}
              </button>
            )}
          </Field>
        )}
        <Field label={t("home.overlay")}>
          <button onClick={() => void setVisible(!status.overlayVisible)}>
            <Icon name={status.overlayVisible ? "eyeOff" : "eye"} size={16} />
            {t(status.overlayVisible ? "home.overlay.hide" : "home.overlay.show")}
          </button>
          <button onClick={() => void setLocked(!settings.overlay.locked)}>
            <Icon name={settings.overlay.locked ? "unlock" : "lock"} size={16} />
            {t(settings.overlay.locked ? "home.overlay.unlock" : "home.overlay.lock")}
          </button>
        </Field>
      </div>
    </>
  );
}

// Thanh mức âm lượng: tự theo `level` (khoảng 10 lần mỗi giây), để phần còn lại của màn hình chính không vẽ lại theo.
function LevelMeter({ label }: { label: string }) {
  const running = useApp((s) => s.status?.session === "running");
  const level = useApp((s) => s.level);
  return <meter className="level" min={0} max={1} value={running ? levelToMeter(level) : 0} aria-label={label} />;
}
